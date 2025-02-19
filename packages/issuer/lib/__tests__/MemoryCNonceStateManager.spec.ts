import { C_NONCE_MISSING_ERROR, CNonceState } from '@sphereon/openid4vci-common'
import { v4 } from 'uuid'

import { MemoryCNonceStateManager } from '../state-manager'

describe('MemoryIssuerStateManager', () => {
  let memoryCNonceStateManager: MemoryCNonceStateManager

  beforeAll(() => {
    memoryCNonceStateManager = new MemoryCNonceStateManager()
  })

  beforeEach(async () => {
    const day = 86400000
    for (const i of Array.from(Array(3).keys())) {
      const timestamp = +new Date(+new Date() + day * (i - 1))
      const cNonce: CNonceState = { cNonce: v4(), createdOn: timestamp }
      await memoryCNonceStateManager.setState(String(i), cNonce)
    }
  })

  it('should retrieve a state', async () => {
    await expect(memoryCNonceStateManager.getState(String(0))).resolves.toBeDefined()
    await expect(memoryCNonceStateManager.getAssertedState(String(0))).resolves.toBeDefined()
  })
  it('should check whether a state exists', async () => {
    await expect(memoryCNonceStateManager.hasState(String(1))).resolves.toBeTruthy()
  })
  it('should delete a state', async () => {
    await expect(memoryCNonceStateManager.deleteState(String(1))).resolves.toBeTruthy()
    await expect(memoryCNonceStateManager.getState(String(0))).resolves.toBeDefined()
    await expect(memoryCNonceStateManager.getState(String(1))).resolves.toBeUndefined()
    await expect(memoryCNonceStateManager.getState(String(2))).resolves.toBeDefined()
  })
  it('should delete all expired states', async () => {
    await memoryCNonceStateManager.clearExpiredStates(+new Date() + 10000)
    // yesterday should be expired
    await expect(memoryCNonceStateManager.getState(String(0))).resolves.toBeUndefined()
    // today should be expired because the method parameter is a few milliseconds ahead
    await expect(memoryCNonceStateManager.getState(String(1))).resolves.toBeUndefined()
    await expect(memoryCNonceStateManager.getState(String(2))).resolves.toBeDefined()
  })
  it('should delete all states', async () => {
    await memoryCNonceStateManager.clearAllStates()
    await expect(memoryCNonceStateManager.getState(String(0))).resolves.toBeUndefined()
    await expect(memoryCNonceStateManager.getState(String(1))).resolves.toBeUndefined()
    await expect(memoryCNonceStateManager.getState(String(2))).resolves.toBeUndefined()
  })
  it('should throw exception when state does not exist', async () => {
    await expect(memoryCNonceStateManager.getAssertedState(String(3))).rejects.toThrowError(Error(C_NONCE_MISSING_ERROR))
  })
})
