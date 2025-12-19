import { Repository } from 'typeorm';
import { WhatsappSession } from './whatsapp-session.entity';
import {
  AuthenticationCreds,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON,
  proto,
} from '@whiskeysockets/baileys';

type AuthState = {
  creds: AuthenticationCreds;
  keys: {
    get: <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => Promise<{ [id: string]: SignalDataTypeMap[T] }>;
    set: (data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }) => Promise<void>;
  };
};

export async function useDBAuthState(
  sessionRepository: Repository<WhatsappSession>,
  sessionId: number,
): Promise<{ state: AuthState; saveCreds: () => Promise<void> }> {

  // Get session from database
  const session = await sessionRepository.findOne({ where: { id: sessionId } });
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Parse stored credentials or create new ones
  let creds: AuthenticationCreds;
  let keys: Record<string, any> = {};

  if (session.sessionData) {
    try {
      const data = JSON.parse(session.sessionData, BufferJSON.reviver);
      creds = data.creds || initAuthCreds();
      keys = data.keys || {};
    } catch {
      creds = initAuthCreds();
      keys = {};
    }
  } else {
    creds = initAuthCreds();
    keys = {};
  }

  // Save credentials to database
  const saveCreds = async () => {
    const data = JSON.stringify({ creds, keys }, BufferJSON.replacer);
    await sessionRepository.update(sessionId, { sessionData: data });
  };

  // Save initial creds if new
  if (!session.sessionData) {
    await saveCreds();
  }

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            const key = `${type}-${id}`;
            let value = keys[key];
            if (value) {
              if (type === 'app-state-sync-key') {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }
          }
          return data;
        },
        set: async (data) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries || {})) {
              const key = `${type}-${id}`;
              if (value) {
                keys[key] = value;
              } else {
                delete keys[key];
              }
            }
          }
          await saveCreds();
        },
      },
    },
    saveCreds,
  };
}
