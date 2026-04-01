-- Create an email identity for a user who signed up via OAuth and later set a password
CREATE OR REPLACE FUNCTION create_email_identity(p_user_id UUID, p_email TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = p_user_id AND provider = 'email'
  ) THEN
    INSERT INTO auth.identities (id, provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      p_user_id::text,
      p_user_id,
      'email',
      jsonb_build_object('sub', p_user_id::text, 'email', p_email),
      now(), now(), now()
    );
  END IF;
END;
$$;
