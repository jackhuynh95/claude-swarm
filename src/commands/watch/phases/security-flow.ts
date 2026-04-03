import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { addComment } from './label-manager.js';

export interface SecurityFlowConfig {
  repo: string;
  autoMode: boolean;
  cwd?: string;
}

export interface SecurityFlowResult {
  redPass: boolean;
  results: PhaseResult[];
}

// Result parsing patterns
const SECURITY_RESULT_PATTERN = /SECURITY_RESULT:\s*(PASS|FAIL)\s*[—\-]\s*(.+)/i;
const VULN_PATTERN = /vulnerabilit|critical|high.*risk|injection|xss|sqli|auth.*bypass|data.*leak|secret.*exposed/i;

function parseSecurityResult(output: string): boolean {
  const match = output.match(SECURITY_RESULT_PATTERN);
  if (match) return match[1].toUpperCase() === 'PASS';
  // If no structured result, check for vulnerability signals
  return !VULN_PATTERN.test(output);
}

function buildScanPrompt(issue: { number: number; title: string }): string {
  return `/ck:security-scan Run OWASP security audit on changes for #${issue.number}: ${issue.title}

Check for:
- OWASP Top 10 vulnerabilities
- Hardcoded secrets and API keys
- Vulnerable dependencies (npm audit / pip audit)
- Insecure configurations

Report results as:
SECURITY_RESULT: PASS — [summary]
or
SECURITY_RESULT: FAIL — [what was found]`;
}

function buildReviewPrompt(issue: { number: number; title: string }): string {
  return `/ck:code-review --security Deep security code review for #${issue.number}: ${issue.title}

Focus on:
- Input validation at system boundaries
- Authentication and authorization flaws
- Injection vectors (SQL, command, path traversal)
- Data exposure and information leaks
- Cryptographic weaknesses
- Race conditions and TOCTOU bugs

Report results as:
SECURITY_RESULT: PASS — [summary]
or
SECURITY_RESULT: FAIL — [what was found]`;
}

function buildStridePrompt(issue: { number: number; title: string }): string {
  return `/ck:security Perform STRIDE threat modeling for #${issue.number}: ${issue.title}

Analyze using STRIDE categories:
- Spoofing: Can identity be faked?
- Tampering: Can data be modified?
- Repudiation: Can actions be denied?
- Information Disclosure: Can data leak?
- Denial of Service: Can service be disrupted?
- Elevation of Privilege: Can access be escalated?

Report results as:
SECURITY_RESULT: PASS — [summary]
or
SECURITY_RESULT: FAIL — [threats identified]`;
}

function buildFixPrompt(issue: { number: number; title: string }, findings: string): string {
  return `/ck:fix --security Auto-fix security issues found in #${issue.number}: ${issue.title}

Issues to fix:
${findings}

Apply fixes for identified vulnerabilities. Prioritize critical/high severity first.`;
}

function buildRedTestComment(
  issueNum: number,
  redPass: boolean,
  scanStatus: string,
  reviewStatus: string,
  strideStatus: string,
  fixStatus: string,
): string {
  const icon = redPass ? '✅' : '⚠️';
  const status = redPass ? 'PASS' : 'ISSUES FOUND';
  return `<!-- claude-swarm:red-test -->
${icon} **Red Test Result for #${issueNum}: ${status}**

| Phase | Result |
|-------|--------|
| Security Scan | ${scanStatus} |
| Security Review | ${reviewStatus} |
| STRIDE Analysis | ${strideStatus} |
| Auto-Fix | ${fixStatus} |`;
}

/**
 * Red testing pipeline for the watch daemon.
 * Sequential: scan (fail-fast) → review (advisory) → STRIDE (advisory) → auto-fix (conditional).
 * Never blocks the main pipeline — advisory only.
 */
export async function executeSecurityFlow(
  classified: ClassifiedIssue,
  config: SecurityFlowConfig,
): Promise<SecurityFlowResult> {
  const { issue } = classified;
  const results: PhaseResult[] = [];

  let scanStatus = 'skipped';
  let reviewStatus = 'skipped';
  let strideStatus = 'skipped';
  let fixStatus = 'skipped';
  const findings: string[] = [];

  // 1. /ck:security-scan — OWASP + secrets + deps, FAIL blocks pipeline
  const scanResult = await invokeClaudePhase(
    buildScanPrompt(issue), 'security', undefined, classified.modelOverride ? { model: classified.modelOverride } : undefined, config.autoMode, config.cwd,
  );
  results.push(scanResult);
  const scanPassed = scanResult.success && parseSecurityResult(scanResult.output ?? '');
  scanStatus = scanPassed ? 'PASS' : 'FAIL';

  if (!scanPassed) {
    if (scanResult.output) findings.push(scanResult.output);
    await addComment(config.repo, issue.number,
      buildRedTestComment(issue.number, false, scanStatus, reviewStatus, strideStatus, fixStatus));
    return { redPass: false, results };
  }

  // 2. /ck:code-review --security — deep security review, advisory
  const reviewResult = await invokeClaudePhase(
    buildReviewPrompt(issue), 'security_review', undefined, classified.modelOverride ? { model: classified.modelOverride } : undefined, config.autoMode, config.cwd,
  );
  results.push(reviewResult);
  const reviewPassed = reviewResult.success && parseSecurityResult(reviewResult.output ?? '');
  reviewStatus = reviewPassed ? 'PASS' : 'FAIL';
  if (!reviewPassed && reviewResult.output) findings.push(reviewResult.output);

  // 3. /ck:security — STRIDE threat modeling, advisory
  const strideResult = await invokeClaudePhase(
    buildStridePrompt(issue), 'security_stride', undefined, classified.modelOverride ? { model: classified.modelOverride } : undefined, config.autoMode, config.cwd,
  );
  results.push(strideResult);
  const stridePassed = strideResult.success && parseSecurityResult(strideResult.output ?? '');
  strideStatus = stridePassed ? 'PASS' : 'FAIL';
  if (!stridePassed && strideResult.output) findings.push(strideResult.output);

  // 4. /ck:fix --security — conditional: only if vulnerabilities detected
  const hasVulns = findings.length > 0 ||
    VULN_PATTERN.test(reviewResult.output ?? '') ||
    VULN_PATTERN.test(strideResult.output ?? '');

  if (hasVulns) {
    const fixResult = await invokeClaudePhase(
      buildFixPrompt(issue, findings.join('\n\n')),
      'fix', undefined, classified.modelOverride ? { model: classified.modelOverride } : undefined, config.autoMode, config.cwd,
    );
    results.push(fixResult);
    fixStatus = fixResult.success ? 'applied' : 'failed';
  }

  // 5. Post red test summary comment
  const redPass = scanPassed && reviewPassed && stridePassed;
  await addComment(config.repo, issue.number,
    buildRedTestComment(issue.number, redPass, scanStatus, reviewStatus, strideStatus, fixStatus));

  return { redPass, results };
}
