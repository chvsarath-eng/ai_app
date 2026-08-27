variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "Primary GCP region"
  type        = string
  default     = "us-central1"
}

variable "github_owner" {
  description = "GitHub repository owner"
  type        = string
  default     = "chvsarath-eng"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "ai_app"
}

variable "deployer_service_account_id" {
  description = "Service account ID (without domain)"
  type        = string
  default     = "github-actions-deployer"
}

variable "workload_identity_pool_id" {
  description = "Workload Identity Pool ID"
  type        = string
  default     = "github-actions-pool"
}

variable "workload_identity_provider_id" {
  description = "Workload Identity Provider ID"
  type        = string
  default     = "github-oidc"
}
