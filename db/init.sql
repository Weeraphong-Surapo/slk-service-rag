-- Runs automatically the first time the MySQL container starts (empty volume)

CREATE TABLE IF NOT EXISTS documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(150) NOT NULL,
  size_bytes    INT UNSIGNED NOT NULL,
  content       LONGTEXT     NULL,
  status        ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
  chunk_count   INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_documents_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
