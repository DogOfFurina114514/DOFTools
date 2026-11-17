import type { AIMessage } from './ai'
import type { ChatItem } from './ai-session'

interface Conversation {
  version: 1
  chat: ChatItem[]
  messages: AIMessage[]
}
let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('dogoffurina-chat', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('conversations')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      database = undefined
      reject(request.error)
    }
  }))
}
export async function readConversation(): Promise<Conversation | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('conversations').objectStore('conversations').get('current')
    request.onsuccess = () => {
      const value = request.result as Conversation | undefined
      resolve(
        value?.version === 1 && Array.isArray(value.chat) && Array.isArray(value.messages)
          ? value
          : null,
      )
    }
    request.onerror = () => reject(request.error)
  })
}
export async function saveConversation(chat: ChatItem[], messages: AIMessage[]) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('conversations', 'readwrite')
    // IndexedDB preserves Blobs and Files; no base64, external paths or object URLs.
    transaction
      .objectStore('conversations')
      .put({ version: 1, chat, messages } satisfies Conversation, 'current')
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
  })
}
