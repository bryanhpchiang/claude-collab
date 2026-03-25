export type CoordinationUser = {
  id: string;
  email: string;
  login: string;
  name: string;
  avatar_url: string;
};

export type DashboardJam = {
  id: string;
  instanceId: string;
  url: string | null;
  state: string;
  creator: {
    user_id: string;
    login: string;
    name: string;
    avatar_url: string;
  };
  created_at: string;
  name: string | null;
};

export type DashboardMember = {
  user_id: string;
  login: string;
  name: string;
  email: string;
  role: string;
};

export type DashboardInviteLink = {
  id: string;
  jam_id: string;
  created_by_user_id: string;
  created_at: string;
  claimed_at?: string | null;
  revoked_at?: string | null;
};

export type LandingBootstrap = {
  page: "landing";
  signedIn: boolean;
  authEnabled: boolean;
};

export type DashboardBootstrap = {
  page: "dashboard";
  user: CoordinationUser;
  jams: DashboardJam[];
};

export type CoordinationBootstrap = LandingBootstrap | DashboardBootstrap;
export type CoordinationPage = CoordinationBootstrap["page"];
