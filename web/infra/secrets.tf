# ============================================
# Secret Manager Secrets for img2x-web
# ============================================

# ============================================
# SMTP Secrets
# ============================================

resource "google_secret_manager_secret" "smtp_host" {
  secret_id = "smtp-host"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "smtp_host" {
  secret      = google_secret_manager_secret.smtp_host.id
  secret_data = var.smtp_host
}

resource "google_secret_manager_secret" "smtp_port" {
  secret_id = "smtp-port"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "smtp_port" {
  secret      = google_secret_manager_secret.smtp_port.id
  secret_data = var.smtp_port
}

resource "google_secret_manager_secret" "smtp_user" {
  secret_id = "smtp-user"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "smtp_user" {
  secret      = google_secret_manager_secret.smtp_user.id
  secret_data = var.smtp_user
}

resource "google_secret_manager_secret" "smtp_pass" {
  secret_id = "smtp-pass"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "smtp_pass" {
  secret      = google_secret_manager_secret.smtp_pass.id
  secret_data = var.smtp_pass
}

# ============================================
# Story Service Secrets
# ============================================

resource "google_secret_manager_secret" "story_service_url" {
  secret_id = "story-service-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "story_service_url" {
  secret      = google_secret_manager_secret.story_service_url.id
  secret_data = var.story_service_url
}

resource "google_secret_manager_secret" "story_invoker_credentials" {
  secret_id = "story-invoker-credentials"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "story_invoker_credentials" {
  secret      = google_secret_manager_secret.story_invoker_credentials.id
  secret_data = var.story_invoker_credentials_json
}

# ============================================
# IAM Bindings for Service Account to access secrets
# ============================================

resource "google_secret_manager_secret_iam_member" "smtp_host_access" {
  secret_id = google_secret_manager_secret.smtp_host.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "smtp_port_access" {
  secret_id = google_secret_manager_secret.smtp_port.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "smtp_user_access" {
  secret_id = google_secret_manager_secret.smtp_user.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "smtp_pass_access" {
  secret_id = google_secret_manager_secret.smtp_pass.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "story_service_url_access" {
  secret_id = google_secret_manager_secret.story_service_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "story_invoker_credentials_access" {
  secret_id = google_secret_manager_secret.story_invoker_credentials.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}
