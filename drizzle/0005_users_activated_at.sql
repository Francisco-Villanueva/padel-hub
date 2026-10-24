-- Cuentas por invitación: `activated_at` es nulo mientras la persona no eligió su contraseña (esa cuenta no puede iniciar sesión).
-- Por defecto una cuenta nace activada; la invitación la crea en NULL explícito. Las que ya existen quedan activadas desde que se crearon.
ALTER TABLE "users" ADD COLUMN "activated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
UPDATE "users" SET "activated_at" = "created_at";--> statement-breakpoint
-- El panel del club muestra quién está pendiente de activar; la contraseña y los contadores siguen sin ser legibles para app_user.
GRANT SELECT ("activated_at") ON "users" TO app_user;
