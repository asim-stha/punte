# database

PostgreSQL, the "database" container.

- `init.sql` creates the `user_data` table. Docker runs it automatically the first time the container starts with an empty volume.
- `backup.sh` saves a compressed copy into `backups/` (folder is ignored by git). On the cloud VM it also uploads the copy to Azure.
- `restore.sh` loads a backup again (replaces the current data)
- `azure-blob.sh` uploads, lists and downloads backups in the Azure storage container

The container has no public port. Only the backend can reach it.

## Backups in Azure

`infra/enable-backups.sh` turns on a nightly backup (03:00 Korea time). The VM logs in with its own Azure identity, so there are no keys or passwords. Azure deletes backups older than 14 days, and the VM deletes its local copies after 7 days.

Run these on the VM from the `punte` folder.

See the backups in Azure:

```
BACKUP_STORAGE_ACCOUNT=<account name> sh database/azure-blob.sh list
```

Restore one:

```
BACKUP_STORAGE_ACCOUNT=<account name> sh database/azure-blob.sh download <file name> backups
sh database/restore.sh backups/<file name>
```

The nightly results are written to `backups/backup.log`.
