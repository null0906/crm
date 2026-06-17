export function getRoleDisplayName(role: string | null | undefined) {
  if (!role) return '';
  return role === 'sales_rep' || role === 'Sales Rep' ? 'Analyst' : role;
}

