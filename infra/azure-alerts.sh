#!/usr/bin/env bash
# azure-alerts: email alerts for the punte vm (cpu stuck high, vm down) and a monthly budget alert
# run it in Azure Cloud Shell: bash infra/azure-alerts.sh <your email>
# every part is tried on its own, so one part being refused (student plans limit some) does not stop the rest
set -uo pipefail

RG=punte-rg
VM=punte-vm
BUDGET_USD=20          # monthly limit, emails come at 50% and 90% of it
CPU_LIMIT=85

EMAIL=${1:-}
[ -n "$EMAIL" ] || read -r -p "Email for alerts: " EMAIL
[[ "$EMAIL" == *@*.* ]] || { echo "That does not look like an email address"; exit 1; }

try() {   # try "name" command...  -> prints ok or skipped
  local name=$1; shift
  if "$@" >/dev/null 2>"$ERR"; then echo "  ok       $name"; else echo "  skipped  $name ($(tail -n 1 "$ERR" | cut -c1-120))"; fi
}
ERR=$(mktemp)

VM_ID=$(az vm show --resource-group "$RG" --name "$VM" --query id --output tsv)

echo "[1/4] who gets the emails"
try "action group" az monitor action-group create --resource-group "$RG" --name punte-alerts --short-name punte --action email owner "$EMAIL"
AG_ID=$(az monitor action-group show --resource-group "$RG" --name punte-alerts --query id --output tsv)

echo "[2/4] cpu alert (above $CPU_LIMIT% for 15 minutes)"
try "cpu alert" az monitor metrics alert create --resource-group "$RG" --name punte-cpu-high --scopes "$VM_ID" \
  --condition "avg Percentage CPU > $CPU_LIMIT" --window-size 15m --evaluation-frequency 5m --severity 2 \
  --action "$AG_ID" --description "punte-vm cpu is above $CPU_LIMIT percent"

echo "[3/4] vm down alert"
try "vm down alert" az monitor metrics alert create --resource-group "$RG" --name punte-vm-down --scopes "$VM_ID" \
  --condition "avg VmAvailabilityMetric < 1" --window-size 5m --evaluation-frequency 1m --severity 1 \
  --action "$AG_ID" --description "punte-vm is not available"

echo "[4/4] monthly budget of $BUDGET_USD USD"
TEMPLATE=$(mktemp)
cat > "$TEMPLATE" <<'JSON'
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "amount": { "type": "int" },
    "start": { "type": "string" },
    "end": { "type": "string" },
    "email": { "type": "string" }
  },
  "resources": [{
    "type": "Microsoft.Consumption/budgets",
    "apiVersion": "2023-05-01",
    "name": "punte-monthly",
    "properties": {
      "category": "Cost",
      "amount": "[parameters('amount')]",
      "timeGrain": "Monthly",
      "timePeriod": { "startDate": "[parameters('start')]", "endDate": "[parameters('end')]" },
      "notifications": {
        "half": { "enabled": true, "operator": "GreaterThan", "threshold": 50, "thresholdType": "Actual", "contactEmails": ["[parameters('email')]"] },
        "almost": { "enabled": true, "operator": "GreaterThan", "threshold": 90, "thresholdType": "Actual", "contactEmails": ["[parameters('email')]"] }
      }
    }
  }]
}
JSON
try "budget" az deployment group create --resource-group "$RG" --template-file "$TEMPLATE" \
  --parameters amount="$BUDGET_USD" start="$(date +%Y-%m-01)" end="$(date -d '+2 years' +%Y-%m-01)" email="$EMAIL"
rm -f "$TEMPLATE" "$ERR"

echo
echo "done. a skipped part can be set by hand in the Azure portal (see docs/deploy.md)"
