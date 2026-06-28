-- Defense-in-depth: explicit RESTRICTIVE policies so non-admins can NEVER
-- write to user_roles, even if a future permissive policy is added by mistake.
CREATE POLICY "only admins may insert roles"
  ON public.user_roles AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "only admins may update roles"
  ON public.user_roles AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "only admins may delete roles"
  ON public.user_roles AS RESTRICTIVE FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Orders: lock down update/delete to admins explicitly. Today there is no
-- permissive UPDATE/DELETE policy so non-admins are blocked by default;
-- this RESTRICTIVE rule guarantees that stays true if a permissive policy
-- is ever added for a "cancel order" flow.
CREATE POLICY "only admins may update orders"
  ON public.orders AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "only admins may delete orders"
  ON public.orders AS RESTRICTIVE FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
