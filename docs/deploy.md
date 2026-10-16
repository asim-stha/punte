# Deploy Punte on Azure

From an empty Azure account to the live site. Every script is in `infra/`.

## You need

- An Azure account (the student offer works)
- This GitHub repository
- A browser (everything is done in Azure Cloud Shell and over SSH)

## 1. Create the Azure resources

1. Open the Azure portal and start Cloud Shell (the `>_` button). Choose Bash.
2. Run:
   ```
   git clone https://github.com/asim-stha/punte.git
   bash punte/infra/azure-setup.sh
   ```
3. Write down the storage account name and the `ssh` line it prints.

## 2. Set up the VM

1. Connect with the `ssh` line from step 1.
2. On the VM run:
   ```
   curl -fsSLO https://raw.githubusercontent.com/asim-stha/punte/main/infra/vm-setup.sh
   bash vm-setup.sh
   ```
3. Type the website password and the ESP token when it asks. Use the same token in `firmware/desktop_body/secrets.h`.
4. Open `https://punte-cybersquadnp.japaneast.cloudapp.azure.com` and log in.

## 3. Turn on backups

On the VM, from the `punte` folder:

```
bash infra/enable-backups.sh <storage account name>
```

It makes one backup right away and lists the backups in Azure. After that a backup is made every night.

## 4. Turn on alerts

In Cloud Shell:

```
bash punte/infra/azure-alerts.sh <your email>
```

If a part is skipped, set it by hand in the portal:

- CPU or VM down: open `punte-vm`, then Alerts, then Create alert rule.
- Budget: open Cost Management, then Budgets, then Add. Use a monthly budget with emails at 50% and 90%.

The `uptime` workflow in GitHub also checks the live site every 30 minutes.

## 5. Check that everything works

- `https://<address>/healthz` shows `"status":"ok"` and `"storage":"postgres"`.
- On the VM, `docker compose ps` (inside `punte/docker`) shows four containers, three of them healthy.
- Save a face on the website, run `docker compose restart backend`, and check the face is still there.

## Update the VM later

```
cd ~/punte
bash infra/deploy.sh
```

## Moving from an older VM setup

1. Find the folder of the old setup (`ls ~`) and stop it there with `docker compose down`. Never add `-v`.
2. Check that ports 80 and 443 are free: `sudo ss -tlnp | grep -E ':80 |:443 '`
3. Run `vm-setup.sh` (step 2).
4. Faces saved in Supabase are not copied. Save them again on the website.
5. The ESP32 keeps working if `ESP_TOKEN` on the VM is the same as in `secrets.h`.

## Remove everything after the demo

In Cloud Shell: `az group delete --name punte-rg`. This deletes the VM, the storage and the backups.
