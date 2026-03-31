-- Super-administrateurs : accès à la page Rapports et aux statistiques financières agrégées.
CREATE TABLE IF NOT EXISTS app_super_admins (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_super_admins_user_id ON app_super_admins (user_id);
