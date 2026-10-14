// Keep the browser copy in apps/web/src/lib/password-policy.ts in sync.
// This local blocklist is not a comprehensive database of breached passwords.
const commonWords = new Set([
  "password", "passwd", "pass", "senha", "senhas", "minhasenha", "novasenha",
  "admin", "administrador", "administrator", "root", "usuario", "user",
  "login", "acesso", "entrar", "welcome", "bemvindo", "letmein", "changeme",
  "default", "test", "teste", "testing", "guest", "master", "secret", "segredo",
  "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm",
  "abc", "abcd", "abcde", "abcdef", "abcdefgh", "abcdefghi", "abcdefghij",
  "iloveyou", "teamo", "euteamo", "amor", "amorzinho", "familia", "deus",
  "jesus", "jesuscristo", "deusefiel", "felicidade", "saudade", "princesa",
  "princess", "superman", "batman", "dragon", "monkey", "sunshine", "shadow",
  "football", "baseball", "futebol", "brasil", "brazil", "brasileiro",
  "flamengo", "corinthians", "palmeiras", "saopaulo", "santos", "vasco",
  "internet", "computer", "computador", "samsung", "motorola", "sabrina",
  "gabriel", "gabriela", "mariana", "daniel", "daniela", "rafael", "rafaela",
  "leonardo", "rodrigo", "fernando", "fernanda", "carolina", "patricia",
  "alexandre", "anderson", "marcelo", "roberto", "eduardo", "lucas", "matheus",
  "nicole", "michael", "jennifer", "jessica", "charlie", "donald", "extraok",
]);

const commonNumericPasswords = new Set([
  "11223344", "1122334455", "112233445566", "10203040", "1020304050",
  "12344321", "1234554321", "123654789", "147258369", "159753456",
]);

const sequences = [
  "01234567890123456789", "98765432109876543210", "abcdefghijklmnopqrstuvwxyz",
  "zyxwvutsrqponmlkjihgfedcba", "qwertyuiop", "poiuytrewq", "asdfghjkl",
  "lkjhgfdsa", "zxcvbnm", "mnbvcxz", "1qaz2wsx3edc", "qazwsxedcrfv",
  "1q2w3e4r5t6y", "q1w2e3r4t5y6",
];
const substitutions: Record<string, string> = {
  "@": "a", "4": "a", "0": "o", "3": "e", "1": "i", "!": "i", "$": "s", "5": "s", "7": "t",
};

export const commonPasswordMessage = "Esta senha é muito comum ou previsível. Escolha uma senha menos óbvia.";
export const newPasswordHint = "Use de 8 a 12 caracteres. Evite senhas comuns, sequências e repetições.";

export function isCommonPassword(password: string): boolean {
  // Normalization is only for screening. Never alter the password being hashed.
  const normalized = password.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
  if (!normalized || /^(.{1,4})\1+$/u.test(normalized)) return true;

  const compact = normalized.replace(/[^a-z0-9]/g, "");
  if (commonNumericPasswords.has(compact)) return true;
  if (compact.length >= 4 && sequences.some((sequence) => sequence.includes(compact))) return true;
  if (compact.length >= 4 && /^(.{1,4})\1+$/.test(compact)) return true;

  // Check the whole word and obvious numeric/symbol wrappers, including leetspeak.
  const candidates = [
    normalized,
    normalized.replace(/^\d+|\d+$/g, ""),
    normalized.replace(/^[\d\W_]+|[\d\W_]+$/g, ""),
  ];
  return candidates.some((candidate) => {
    const plain = candidate.replace(/[^a-z]/g, "");
    const unmasked = candidate.replace(/[@4031!$57]/g, (character) => substitutions[character]!)
      .replace(/[^a-z]/g, "");
    return commonWords.has(plain) || commonWords.has(unmasked);
  });
}
