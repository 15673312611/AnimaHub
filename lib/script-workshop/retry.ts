/**
 * Retry helper for AI generation with validation
 */

interface RetryOptions {
  maxAttempts: number;
  baseDelay?: number; // ms
  onAttempt?: (attempt: number, error: string) => void;
}

export async function retryWithValidation<T>(
  fn: () => Promise<T>,
  validate: (result: T) => { ok: true; value: T } | { ok: false; error: string },
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelay = 1000, onAttempt } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      const validation = validate(result);

      if (validation.ok) {
        return validation.value;
      }

      // Validation failed
      if (attempt < maxAttempts) {
        onAttempt?.(attempt, validation.error);
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt));
      } else {
        throw new Error(`验证失败（${maxAttempts}次尝试后）: ${validation.error}`);
      }
    } catch (error: any) {
      if (attempt < maxAttempts) {
        onAttempt?.(attempt, error.message || "未知错误");
        await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt));
      } else {
        throw error;
      }
    }
  }

  throw new Error(`重试失败（${maxAttempts}次尝试）`);
}
