# ============================================
# Terraform Variables for img2x-web
# ============================================

# ============================================
# Required Variables
# ============================================

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "github_owner" {
  description = "GitHub repository owner (username or organization)"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = ""
}

variable "enable_cloudbuild_trigger" {
  description = "Whether to create the Cloud Build trigger via Terraform"
  type        = bool
  default     = false
}

# ============================================
# Secret Values (sensitive)
# ============================================

variable "smtp_host" {
  description = "SMTP server hostname"
  type        = string
  sensitive   = true
}

variable "smtp_port" {
  description = "SMTP server port"
  type        = string
  sensitive   = true
}

variable "smtp_user" {
  description = "SMTP username"
  type        = string
  sensitive   = true
}

variable "smtp_pass" {
  description = "SMTP password"
  type        = string
  sensitive   = true
}

variable "story_service_url" {
  description = "URL of the story generation Cloud Run service"
  type        = string
  sensitive   = true
}

variable "story_invoker_credentials_json" {
  description = "JSON credentials for invoking the story service"
  type        = string
  sensitive   = true
}

# ============================================
# Optional Variables with Defaults
# ============================================

variable "region" {
  description = "GCP region for deployment"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "img2x-web"
}

variable "artifact_repo_name" {
  description = "Name of the Artifact Registry repository"
  type        = string
  default     = "img2x-repo"
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances (0 = scale to zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "cpu" {
  description = "CPU allocation for Cloud Run container"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory allocation for Cloud Run container"
  type        = string
  default     = "512Mi"
}
