# ============================================
# Terraform Configuration for img2x-web
# GCP Cloud Run Deployment
# ============================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment to use GCS backend for state storage
  # backend "gcs" {
  #   bucket = "your-terraform-state-bucket"
  #   prefix = "img2x-web"
  # }
}

# ============================================
# Provider Configuration
# ============================================

provider "google" {
  project = var.project_id
  region  = var.region
}

# ============================================
# Enable Required APIs
# ============================================

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ============================================
# Artifact Registry Repository
# ============================================

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.artifact_repo_name
  description   = "Docker repository for img2x web application"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# ============================================
# Service Account for Cloud Run
# ============================================

resource "google_service_account" "cloud_run_sa" {
  account_id   = "img2x-web-sa"
  display_name = "img2x Web Service Account"
  description  = "Service account for img2x-web Cloud Run service"
}

# Grant the service account permission to access secrets
resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Grant the service account permission to invoke the story API
resource "google_project_iam_member" "run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# ============================================
# Cloud Run Service
# ============================================

resource "google_cloud_run_v2_service" "web" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloud_run_sa.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repo_name}/${var.service_name}:latest"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      # Environment variables from secrets
      env {
        name = "SMTP_HOST"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.smtp_host.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "SMTP_PORT"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.smtp_port.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "SMTP_USER"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.smtp_user.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "SMTP_PASS"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.smtp_pass.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STORY_SERVICE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.story_service_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STORY_INVOKER_CREDENTIALS_JSON"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.story_invoker_credentials.secret_id
            version = "latest"
          }
        }
      }

      # Non-secret environment variables
      env {
        name  = "NODE_ENV"
        value = "production"
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.repo,
    google_secret_manager_secret_version.smtp_host,
    google_secret_manager_secret_version.smtp_port,
    google_secret_manager_secret_version.smtp_user,
    google_secret_manager_secret_version.smtp_pass,
    google_secret_manager_secret_version.story_service_url,
    google_secret_manager_secret_version.story_invoker_credentials,
  ]
}

# ============================================
# Allow unauthenticated access (public website)
# ============================================

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = google_cloud_run_v2_service.web.project
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ============================================
# Cloud Build Trigger (GitHub) - Optional
# ============================================
# Uncomment this block after connecting GitHub to Cloud Build
# Go to: GCP Console > Cloud Build > Triggers > Connect Repository

# resource "google_cloudbuild_trigger" "deploy" {
#   name        = "${var.service_name}-deploy"
#   description = "Deploy img2x-web on push to main"
#   location    = var.region
#
#   # GitHub trigger configuration
#   github {
#     owner = var.github_owner
#     name  = var.github_repo
#
#     push {
#       branch = "^main$"
#     }
#   }
#
#   filename = "web/cloudbuild.yaml"
#
#   substitutions = {
#     _REGION       = var.region
#     _REPO         = var.artifact_repo_name
#     _SERVICE_NAME = var.service_name
#   }
#
#   depends_on = [google_project_service.apis]
# }

# ============================================
# Outputs
# ============================================

output "service_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.web.uri
}

output "service_account_email" {
  description = "The service account email used by Cloud Run"
  value       = google_service_account.cloud_run_sa.email
}

output "artifact_registry_url" {
  description = "The Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repo_name}"
}
