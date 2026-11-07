import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { SystemData, TeacherAccount } from '../src/types/exam';

const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
const SCRYPT_PARAMETERS = '32768,8,3';
export const MAX_PASSWORD_LENGTH = 256;

export type StoredTeacher = TeacherAccount & { passwordHash?: string; password?: string };
export type StoredExamState = Omit<SystemData, 'teachers'> & { teachers?: StoredTeacher[] };

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_PARAMETERS}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, parameters, salt, key] = encoded.split('$');
  if (scheme !== 'scrypt' || parameters !== SCRYPT_PARAMETERS ||
    !/^[\da-f]{32}$/.test(salt) || !/^[\da-f]{64}$/.test(key)) return false;
  return timingSafeEqual(await deriveKey(password, Buffer.from(salt, 'hex')), Buffer.from(key, 'hex'));
}

export function publicTeacher(teacher: StoredTeacher): TeacherAccount {
  const { id, name, username, department, assignedClassId, examAuthorAssignments } = teacher;
  return { id, name, username, department, assignedClassId, examAuthorAssignments };
}

export function adminState(state: StoredExamState): SystemData {
  return { ...state, teachers: state.teachers?.map(publicTeacher) };
}
