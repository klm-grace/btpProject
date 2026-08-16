-- Section 13 — Fix type ip_address dans security_events
-- security_events stocke un hash RGPD (hex) de l'IP, pas une adresse IP réelle.
-- Le type INET rejetait ces valeurs ("invalid input syntax for type inet").
-- audit_logs et sessions stockent de vraies IPs → restent en INET.

ALTER TABLE security_events
  ALTER COLUMN ip_address TYPE TEXT USING ip_address::text;