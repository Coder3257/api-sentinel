-- Add user_id to repos referencing users(id)
ALTER TABLE repos ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
