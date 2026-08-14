import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/**
 * What this server allows.
 *
 * `GET /settings` sounds right and returns nothing useful — the Settings model
 * has only an id column. The capabilities live on the health endpoint, at its
 * deliberately unguessable path.
 *
 * The flags are **omitted when false**, never sent as `false`, so anything
 * absent has to be read as off.
 */
const HEALTH_PATH = "/health/8M4F88S8ooi4sMbLBfkkV7ctWwgibW6V";

interface HealthResponse {
  version?: number;
  min_frontend_version?: number;
  oidc_provider?: string[];
  privacy_policy?: string;
  terms?: string;
  open_registration?: boolean;
  email_mandatory?: boolean;
  disable_username_password_login?: boolean;
}

export interface Capabilities {
  version: number | null;
  oidcProviders: string[];
  openRegistration: boolean;
  emailMandatory: boolean;
  passwordLoginDisabled: boolean;
  privacyPolicy: string | null;
  terms: string | null;
}

function normalise(response: HealthResponse): Capabilities {
  return {
    version: response.version ?? null,
    oidcProviders: response.oidc_provider ?? [],
    openRegistration: response.open_registration === true,
    emailMandatory: response.email_mandatory === true,
    passwordLoginDisabled: response.disable_username_password_login === true,
    privacyPolicy: response.privacy_policy ?? null,
    terms: response.terms ?? null,
  };
}

export function useCapabilities() {
  return useQuery({
    queryKey: ["capabilities"],
    // Unauthenticated on purpose: the login screen needs this before there is a
    // session, to know whether to offer signup or OIDC at all.
    queryFn: async () => normalise(await api<HealthResponse>(HEALTH_PATH, { anonymous: true })),
    staleTime: Infinity,
    retry: 1,
  });
}
