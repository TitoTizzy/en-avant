export const PERMISSIONS = [
  'acces_dashboard', 'gerer_utilisateurs', 'gerer_articles', 'gerer_evenements',
  'gerer_galerie', 'gerer_organigramme', 'gerer_trivia', 'voir_membres',
  'traiter_membres', 'voir_ninu', 'exporter_donnees', 'voir_dons', 'voir_leads',
  'gerer_parametres', 'gerer_newsletter', 'espace_membre', 'jouer_trivia', 'voir_public', 'voir_reserves',
];
export const ROLE_DEFAULTS = {
  superadmin: PERMISSIONS,
  editor: ['espace_membre', 'voir_public'],
  readonly: ['espace_membre', 'voir_public'],
  member: ['espace_membre', 'jouer_trivia', 'voir_reserves'],
};
export const effectivePermissions = profile => Array.isArray(profile.permissions)
  ? profile.permissions : (ROLE_DEFAULTS[profile.role] || []);
export const can = (identity, permission) => identity.isSuperAdmin
  || identity.permissions.includes(permission);
export function assertPermission(identity, permission) {
  if (!can(identity, permission)) {
    throw Object.assign(new Error('Droits insuffisants pour cette opération.'), { status: 403 });
  }
}
