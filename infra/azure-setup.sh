#!/usr/bin/env bash
# azure-setup: creates the Azure resources for punte (resource group, storage for backups, vm, firewall)
# run it in Azure Cloud Shell (bash). anything that already exists is skipped, so it is safe to run twice
set -euo pipefail

# settings
RG=punte-rg
LOCATION=japaneast
VM=punte-vm
VM_SIZE=Standard_B2s
VM_USER=azureuser
DNS_LABEL=punte-cybersquadnp
STORAGE_PREFIX=puntebackups      # storage names must be unique worldwide, so a number is added
CONTAINER=backups
KEEP_DAYS=14                     # backups older than this are deleted by azure

# 1. resource group: one folder in azure that holds everything, delete it to remove everything
echo "[1/5] resource group $RG"
az group create --name "$RG" --location "$LOCATION" --output none

# 2. storage account and a private container for database backups
echo "[2/5] storage for backups"
SA=$(az storage account list --resource-group "$RG" --query "[?starts_with(name,'$STORAGE_PREFIX')].name | [0]" --output tsv)
if [ -z "$SA" ]; then
  SA="$STORAGE_PREFIX$RANDOM"
  az storage account create --name "$SA" --resource-group "$RG" --location "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false --output none
fi
az storage container create --account-name "$SA" --name "$CONTAINER" --auth-mode key --output none

# delete old backups automatically so the storage stays small and cheap
POLICY=$(mktemp)
cat > "$POLICY" <<JSON
{"rules":[{"enabled":true,"name":"delete-old-backups","type":"Lifecycle","definition":{
  "actions":{"baseBlob":{"delete":{"daysAfterModificationGreaterThan":$KEEP_DAYS}}},
  "filters":{"blobTypes":["blockBlob"],"prefixMatch":["$CONTAINER/"]}}}]}
JSON
az storage account management-policy create --account-name "$SA" --resource-group "$RG" --policy @"$POLICY" --output none
rm -f "$POLICY"

# 3. virtual machine (ubuntu 24.04), ssh key login only
echo "[3/5] virtual machine $VM"
if az vm show --resource-group "$RG" --name "$VM" --output none 2>/dev/null; then
  echo "  $VM already exists, skipping"
else
  az vm create --resource-group "$RG" --name "$VM" --location "$LOCATION" \
    --image Canonical:ubuntu-24_04-lts:server:latest --size "$VM_SIZE" \
    --admin-username "$VM_USER" --authentication-type ssh --generate-ssh-keys \
    --public-ip-sku Standard --public-ip-address-dns-name "$DNS_LABEL" --output none
fi

# 4. firewall: only ssh (22), http (80) and https (443) are open
echo "[4/5] firewall ports"
az vm open-port --resource-group "$RG" --name "$VM" --port 80 --priority 1010 --output none
az vm open-port --resource-group "$RG" --name "$VM" --port 443 --priority 1020 --output none

# 5. the vm gets its own identity that may write only to the backups container (no keys or passwords)
echo "[5/5] backup permission for the vm"
PRINCIPAL=$(az vm identity assign --resource-group "$RG" --name "$VM" --query systemAssignedIdentity --output tsv)
SCOPE="$(az storage account show --name "$SA" --resource-group "$RG" --query id --output tsv)/blobServices/default/containers/$CONTAINER"
HAS=$(az role assignment list --assignee "$PRINCIPAL" --scope "$SCOPE" --role "Storage Blob Data Contributor" --query "[0].id" --output tsv)
if [ -z "$HAS" ]; then
  az role assignment create --assignee-object-id "$PRINCIPAL" --assignee-principal-type ServicePrincipal \
    --role "Storage Blob Data Contributor" --scope "$SCOPE" --output none
fi

FQDN=$(az network public-ip list --resource-group "$RG" --query "[?dnsSettings.domainNameLabel=='$DNS_LABEL'].dnsSettings.fqdn | [0]" --output tsv)
echo
echo "done"
echo "  address:         $FQDN"
echo "  backup storage:  $SA / $CONTAINER"
echo "  connect:         ssh $VM_USER@$FQDN"
