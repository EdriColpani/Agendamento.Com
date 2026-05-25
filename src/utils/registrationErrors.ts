/** Erro Supabase Auth quando o e-mail já existe (cadastro anterior ou incompleto). */
export function isDuplicateRegistrationEmailError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already been registered') ||
    normalized.includes('already registered') ||
    normalized.includes('user already registered') ||
    normalized.includes('email address has already') ||
    normalized.includes('duplicate') ||
    normalized.includes('já cadastrado') ||
    normalized.includes('ja cadastrado')
  );
}

export function duplicateRegistrationEmailHelp(email: string): string {
  return `O e-mail ${email} já está cadastrado. Verifique sua caixa de entrada (e spam) para confirmar a conta. Se não encontrar, reenvie o link de confirmação na próxima tela. Se já confirmou, use "Esqueci minha senha" no login da arena.`;
}
