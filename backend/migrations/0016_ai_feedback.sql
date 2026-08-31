-- Migration 0016: Persistent AI Feedback and Eval Analytics Table (P1)
-- Stores explicit customer eval ratings (thumbs up/down) with provider metadata,
-- latency, and tool invocation tracking.

CREATE TABLE IF NOT EXISTS ai_feedback (
  id SERIAL PRIMARY KEY,
  conversation_id VARCHAR(100),
  message_id VARCHAR(100),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  tool_names TEXT[],
  provider VARCHAR(50),
  latency_ms INTEGER,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_conv ON ai_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON ai_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_feedback(created_at);
