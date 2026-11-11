-- B2 security round 1 (B2-S06): an operator's first authenticator needs a single-use enrolment
-- token issued out of band; the password alone no longer lets anyone choose the second factor.
alter type auth_token_kind add value if not exists 'totp_enrolment';
