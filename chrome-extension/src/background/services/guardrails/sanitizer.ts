/**
 * Content sanitizer for removing malicious patterns from untrusted content
 */

import { createLogger } from '@src/background/log';
import { getPatterns } from './patterns';
import { ThreatType } from './types';
import type { SanitizationResult } from './types';

const logger = createLogger('SecuritySanitizer');

/**
 * Passes the pattern list is re-applied for, until the content stops changing.
 *
 * One pass is not enough: the patterns run in array order, so a replacement can reassemble text an
 * earlier pattern would have caught. `</flowkite]]>_untrusted_content>` slips past the tag patterns
 * intact, and then the XML pattern deletes the `]]>` and re-forms the closing delimiter - letting a
 * page close the untrusted block early and address the model as the operator. The cap bounds the
 * opposite risk, a replacement that re-triggers its own pattern.
 */
const MAX_SANITIZE_PASSES = 4;

/**
 * What replaces content that would not settle.
 *
 * Reaching the pass cap is not "close enough" - it means the text is still transforming, and the
 * only reason page text transforms under this list is that it was built to. Returning the
 * half-processed string is how a nested splice bomb escapes.
 */
const UNSTABLE_CONTENT_REPLACEMENT = '[BLOCKED_UNSTABLE_CONTENT]';

/**
 * Length the input is cut to before any pattern runs.
 *
 * This is a stall guard, not a budget: one hostile text node used to be able to hold the
 * single-threaded worker for tens of seconds, and the element listing that arrives here has no
 * length limit of its own. Sized so it never bites real content - a measured 4,000-element listing
 * is ~320,000 characters and costs about 4ms across all four passes - while still bounding the
 * adversarial case, where 100,000 characters of `<!--` costs ~235ms per pass. It was 40,000 first,
 * which was small enough to silently cut a long listing in half and hide every element below the
 * fold from the model, on exactly the paginated pages extraction targets.
 */
const MAX_SANITIZE_INPUT_CHARS = 100_000;

/**
 * Sanitize untrusted content by removing dangerous patterns
 * @param content - Raw untrusted content
 * @param strict - Use strict mode with additional patterns
 * @returns Sanitization result with cleaned content and detected threats
 * @throws Error if pattern processing fails
 */
export function sanitizeContent(content: string | undefined, strict: boolean = false): SanitizationResult {
  if (!content || content.trim() === '') {
    return {
      sanitized: '',
      threats: [],
      modified: false,
    };
  }

  let sanitized = content.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '');
  const detectedThreats = new Set<ThreatType>();
  let wasModified = false;

  // Get security patterns based on strictness level
  const patterns = getPatterns(strict);

  let wasTruncated = false;
  if (sanitized.length > MAX_SANITIZE_INPUT_CHARS) {
    sanitized = `${sanitized.slice(0, MAX_SANITIZE_INPUT_CHARS)}\n[TRUNCATED]`;
    // Deliberately not `wasModified`. That flag gates the whitespace cleanup below, and running
    // that pass over a merely-truncated listing flattens the tab indentation the model reads the
    // page's hierarchy from - a cost paid for nothing, since no pattern matched.
    wasTruncated = true;
  }

  // Apply every pattern, repeatedly, until a whole pass changes nothing.
  let converged = false;
  for (let pass = 0; pass < MAX_SANITIZE_PASSES; pass++) {
    const beforePass = sanitized;

    for (const securityPattern of patterns) {
      try {
        // Create fresh regex instance to avoid state pollution
        const regex = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

        // Check if pattern matches
        if (regex.test(sanitized)) {
          detectedThreats.add(securityPattern.type);

          // Create another fresh instance for replacement
          const replacementRegex = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

          // Apply replacement
          sanitized = sanitized.replace(replacementRegex, securityPattern.replacement || '');
        }
      } catch (error) {
        logger.error(`Error processing pattern ${securityPattern.type}:`, error);
        // Continue with other patterns rather than failing completely
      }
    }

    // Compared by content rather than by length: a replacement the same size as the text it
    // replaced still changed it, and the cleanup below is gated on this flag.
    if (sanitized === beforePass) {
      converged = true;
      break;
    }
    wasModified = true;
    logger.debug(`Sanitizer pass ${pass + 1} changed the content`);
  }

  // Fail closed when the passes ran out with the content still changing.
  //
  // A bounded loop can always be out-nested: `]]]]]]]]>>>>` spliced into the closing delimiter loses
  // one `]]>` per pass, so N layers need N passes, and at the cap the last pass hands back a string
  // in which the delimiter has just finished reassembling. Raising the cap only moves the number the
  // attacker has to write. Refusing to return unsettled content removes the escape entirely, and
  // costs nothing legitimate: ordinary page text converges in one or two passes.
  if (!converged) {
    logger.warning(`Content still changing after ${MAX_SANITIZE_PASSES} sanitizer passes; discarding it`);
    detectedThreats.add(ThreatType.PROMPT_INJECTION);
    return {
      sanitized: UNSTABLE_CONTENT_REPLACEMENT,
      threats: Array.from(detectedThreats),
      modified: true,
    };
  }

  // Clean up any double spaces or empty lines created by replacements
  if (wasModified) {
    sanitized = sanitized
      // Runs of spaces only. Tabs carry the DOM tree's depth (`'\t'.repeat(depth)`), so collapsing
      // them flattened the hierarchy the model grounds element indices against - and any page that
      // tripped a single pattern got that for free.
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n') // Reduce 3+ blank lines to 2
      .trim();

    // Also clean up any empty tags that might remain
    sanitized = cleanEmptyTags(sanitized);
  }

  return {
    sanitized,
    threats: Array.from(detectedThreats),
    modified: wasModified || wasTruncated,
  };
}

/**
 * Check if content contains threats without modifying it
 * Useful for validation without sanitization
 * @param content - Content to analyze for threats
 * @param strict - Use strict mode with additional patterns
 * @returns Array of detected threat types
 */
export function detectThreats(content: string, strict: boolean = false): ThreatType[] {
  if (!content || content.trim() === '') {
    return [];
  }

  const detectedThreats = new Set<ThreatType>();
  const patterns = getPatterns(strict);

  for (const securityPattern of patterns) {
    try {
      // Create fresh regex instance to avoid state pollution
      const regex = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

      if (regex.test(content)) {
        detectedThreats.add(securityPattern.type);
        logger.debug(`Threat detected: ${securityPattern.type} - ${securityPattern.description}`);
      }
    } catch (error) {
      logger.error(`Error testing pattern ${securityPattern.type}:`, error);
      // Continue with other patterns
    }
  }

  return Array.from(detectedThreats);
}

/**
 * Enhanced filtering that also removes empty tags left after sanitization
 * @param content - Content to clean up
 * @returns Content with empty tags removed
 */
export function cleanEmptyTags(content: string): string {
  // Remove empty element pairs like <tag></tag>
  const emptyPairPattern = /<(\w+)[^>]*>\s*<\/\1>/g;
  let result = content.replace(emptyPairPattern, '');
  // Remove stray empty tags like <> or </>
  const strayEmptyTagPattern = /<\s*\/?\s*>/g;
  result = result.replace(strayEmptyTagPattern, '');
  return result;
}
