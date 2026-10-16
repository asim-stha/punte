# infra

Scripts that build the cloud side of Punte on Microsoft Azure and keep it up to date.

- `azure-setup.sh` runs in Azure Cloud Shell. It creates the resource group, backup storage, virtual machine, firewall rules and the VM's backup permission.
- `vm-setup.sh` runs once on the VM. It installs Docker, gets the code, asks for the passwords and starts the four containers.
- `deploy.sh` runs on the VM. It pulls the latest code and restarts what changed. The database volume is kept.

## First time

1. Open Azure Cloud Shell (the `>_` button in the Azure portal) and choose Bash.
2. Get the code and run the setup script:
   ```
   git clone https://github.com/asim-stha/punte.git
   bash punte/infra/azure-setup.sh
   ```
3. Connect to the VM with the `ssh` line the script prints, then run on the VM:
   ```
   curl -fsSLO https://raw.githubusercontent.com/asim-stha/punte/main/infra/vm-setup.sh
   bash vm-setup.sh
   ```
4. Open `https://<the address>` and log in.

## Update the VM later

```
cd ~/punte
bash infra/deploy.sh
```

## What Azure ends up with

- One resource group, `punte-rg` (Japan East). Deleting it removes everything.
- One VM, Ubuntu 24.04, SSH key login only. Open ports: 22, 80, 443.
- One storage account with a private `backups` container. Files older than 14 days are deleted by Azure.
- The VM has its own identity that can write only to the `backups` container, so no storage keys are stored on it.

## Notes

- `azure-setup.sh` skips anything that already exists, so it can be run again safely.
- Passwords are typed on the VM and kept only in `docker/.env` (mode 600). They are never committed.
- Never run `docker compose down -v` on the VM. The `-v` deletes the database.
