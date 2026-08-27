output "deployer_service_account_email" {
  description = "Email for GitHub Actions deployer service account"
  value       = google_service_account.github_deployer.email
}

output "workload_identity_provider" {
  description = "Full WIF provider resource name for GitHub repository variable GCP_WORKLOAD_IDENTITY_PROVIDER"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_repository_variables" {
  description = "Suggested GitHub repository Variables (Settings → Secrets and variables → Actions → Variables)"
  value = {
    GCP_PROJECT_ID                  = var.project_id
    GCP_REGION                      = var.region
    GCP_ARTIFACT_REPOSITORY         = "img2x-repo"
    GCP_DEPLOYER_SERVICE_ACCOUNT    = google_service_account.github_deployer.email
    GCP_WORKLOAD_IDENTITY_PROVIDER  = google_iam_workload_identity_pool_provider.github.name
  }
}
