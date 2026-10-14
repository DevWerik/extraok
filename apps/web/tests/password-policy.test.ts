import assert from 'node:assert/strict'
import test from 'node:test'
import { isCommonPassword as apiIsCommonPassword } from '../../api/src/lib/password-policy.ts'
import { isCommonPassword } from '../src/lib/password-policy.ts'
import { loginSchema, passwordResetConfirmSchema, signupSchema } from '../src/features/auth/schemas/auth-schemas.ts'

const common = [
  '12345678', '1234567890', '987654321', '0123456789', '12345678!', 'aaaaaaaa',
  'ABABABAB', 'abcdabcd', '1111-1111', 'qwertyui', 'Qwerty123!', '1qaz2wsx',
  'Password1!', 'P@ssw0rd!', 'Senha123!', 'S3nh@123', 'Admin123', 'Extraok2026',
  'Bemvindo1', 'Flamengo10', 'Iloveyou', '!!!!!!!!', '  senha123  ', '11223344', '10203040',
]
const accepted = ['Vento!9Lago', 'Nuvem!7Mar', 'R7!mP2#v', 'R7!mP2#vQ9$x', 'caju e luar', 'céu violeta']

test('API and browser screen common passwords and preserve unrelated passwords', () => {
  for (const check of [apiIsCommonPassword, isCommonPassword]) {
    for (const password of common) assert.equal(check(password), true, password)
    for (const password of accepted) assert.equal(check(password), false, password)
  }
})

test('signup and reset apply the blocklist; login still accepts existing passwords', () => {
  const fields = { name: 'Pessoa Teste', businessName: 'Negócio Teste', email: 'pessoa@example.test', phone: '11999999999', acceptTerms: true }
  for (const schema of [signupSchema, passwordResetConfirmSchema]) {
    for (const password of common) {
      const parsed = schema.safeParse({ ...fields, password, confirmPassword: password })
      assert.equal(parsed.success, false, password)
      if (!parsed.success) assert.deepEqual(parsed.error.issues[0].path, ['password'])
    }
    for (const password of accepted) {
      const parsed = schema.parse({ ...fields, password, confirmPassword: password })
      assert.equal(parsed.password, password)
    }
  }
  for (const password of [...common, 'Uma senha antiga com mais de 12 caracteres']) {
    assert.equal(loginSchema.parse({ email: fields.email, password }).password, password)
  }
})
