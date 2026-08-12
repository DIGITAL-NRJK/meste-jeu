CREATE UNIQUE INDEX "session_questions_one_open_per_session_unique" ON "session_questions" USING btree ("quiz_session_id") WHERE "session_questions"."status" = 'OPEN';
