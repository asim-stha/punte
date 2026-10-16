# database

PostgreSQL, the "database" container.

- `init.sql` creates the `user_data` table. Docker runs it automatically the first time the container starts with an empty volume.
- `backup.sh` saves a compressed copy into `backups/` (folder is ignored by git)
- `restore.sh` loads a backup again (replaces the current data)

The container has no public port. Only the backend can reach it.
