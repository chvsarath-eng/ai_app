# GitHub Actions repository variables (non-secret)
# Set these at: https://github.com/chvsarath-eng/ai_app/settings/variables/actions
#
# Or run after `gh auth login`:
#   pwsh scripts/set-github-variables.ps1

@(
  @{ Name = 'GCP_PROJECT_ID'; Value = 'imgstr' }
  @{ Name = 'GCP_REGION'; Value = 'us-central1' }
  @{ Name = 'GCP_ARTIFACT_REPOSITORY'; Value = 'img2x-repo' }
  @{ Name = 'GCP_DEPLOYER_SERVICE_ACCOUNT'; Value = 'github-actions-deployer@imgstr.iam.gserviceaccount.com' }
  @{ Name = 'GCP_WORKLOAD_IDENTITY_PROVIDER'; Value = 'projects/502566942325/locations/global/workloadIdentityPools/github-actions-pool/providers/github-oidc' }
) | ForEach-Object {
  Write-Host "Setting $($_.Name)..."
  gh variable set $_.Name --body $_.Value --repo chvsarath-eng/ai_app
}

Write-Host "Create production environment (if missing):"
Write-Host "  gh api --method PUT repos/chvsarath-eng/ai_app/environments/production"
