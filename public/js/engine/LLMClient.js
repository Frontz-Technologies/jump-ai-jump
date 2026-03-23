export class LLMClient {
  constructor(analytics) {
    this._analytics = analytics;
  }

  async requestDifficulty(llmInput) {
    const startTime = performance.now();
    const stageLabel = llmInput.completedStage != null ? ` for stage ${llmInput.completedStage + 2}` : '';

    if (this._analytics) {
      this._analytics.log('llm', 'request-sent', {
        stage: llmInput.completedStage != null ? llmInput.completedStage + 2 : null,
        input: llmInput,
      });
    }

    try {
      const response = await fetch('/api/generate-difficulty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmInput),
      });

      const elapsed = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (this._analytics) {
          this._analytics.log('llm', 'response-error', {
            stage: llmInput.completedStage != null ? llmInput.completedStage + 2 : null,
            latencyMs: elapsed,
            error: err.error || response.status,
          });
        }
        return null;
      }

      const result = await response.json();
      if (this._analytics) {
        this._analytics.log('llm', 'response-ok', {
          stage: llmInput.completedStage != null ? llmInput.completedStage + 2 : null,
          latencyMs: elapsed,
          response: result,
        });
      }
      return result;
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      if (this._analytics) {
        this._analytics.log('llm', 'response-error', {
          stage: llmInput.completedStage != null ? llmInput.completedStage + 2 : null,
          latencyMs: elapsed,
          error: err.message,
        });
      }
      return null;
    }
  }
}
