import {
  AccessTokenRequest,
  Alg,
  CredentialOfferSession,
  EXPIRED_PRE_AUTHORIZED_CODE,
  GrantTypes,
  INVALID_PRE_AUTHORIZED_CODE,
  IStateManager,
  Jwt,
  JWTSignerCallback,
  PIN_NOT_MATCH_ERROR,
  PIN_VALIDATION_ERROR,
  PRE_AUTH_CODE_LITERAL,
  PRE_AUTHORIZED_CODE_REQUIRED_ERROR,
  TokenError,
  TokenErrorResponse,
  UNSUPPORTED_GRANT_TYPE_ERROR,
  USER_PIN_NOT_REQUIRED_ERROR,
  USER_PIN_REQUIRED_ERROR,
} from '@sphereon/oid4vci-common'

import { isPreAuthorizedCodeExpired } from '../functions'

export interface ITokenEndpointOpts {
  tokenEndpointDisabled?: boolean // Disable if used in an existing OAuth2/OIDC environment and have the AS handle tokens
  tokenPath?: string // token path can either be defined here, or will be deduced from issuer metadata
  interval?: number
  cNonceExpiresIn?: number
  tokenExpiresIn?: number
  preAuthorizedCodeExpirationDuration?: number
  accessTokenSignerCallback?: JWTSignerCallback
  accessTokenIssuer?: string
}

export const generateAccessToken = async (
  opts: Required<Pick<ITokenEndpointOpts, 'accessTokenSignerCallback' | 'tokenExpiresIn' | 'accessTokenIssuer'>> & {
    preAuthorizedCode?: string
    alg?: Alg
  }
): Promise<string> => {
  const { accessTokenIssuer, alg, accessTokenSignerCallback, tokenExpiresIn, preAuthorizedCode } = opts
  const iat = new Date().getTime()
  const jwt: Jwt = {
    header: { typ: 'JWT', alg: alg ?? Alg.ES256K },
    payload: {
      iat,
      exp: tokenExpiresIn,
      iss: accessTokenIssuer,
      ...(preAuthorizedCode && { preAuthorizedCode }),
    },
  }
  return await accessTokenSignerCallback(jwt)
}

export const isValidGrant = (assertedState: CredentialOfferSession, grantType: string): boolean => {
  if (assertedState.credentialOffer?.credential_offer?.grants) {
    // TODO implement authorization_code
    return (
      Object.keys(assertedState.credentialOffer?.credential_offer?.grants).includes(GrantTypes.PRE_AUTHORIZED_CODE) &&
      grantType === GrantTypes.PRE_AUTHORIZED_CODE
    )
  }
  return false
}

export const assertValidAccessTokenRequest = async (
  request: AccessTokenRequest,
  opts: {
    credentialOfferSessions: IStateManager<CredentialOfferSession>
    expirationDuration: number
  }
) => {
  const { credentialOfferSessions, expirationDuration } = opts
  // Only pre-auth supported for now
  if (request.grant_type !== GrantTypes.PRE_AUTHORIZED_CODE) {
    throw new TokenError(400, TokenErrorResponse.invalid_grant, UNSUPPORTED_GRANT_TYPE_ERROR)
  }

  // Pre-auth flow
  if (!request[PRE_AUTH_CODE_LITERAL]) {
    throw new TokenError(400, TokenErrorResponse.invalid_request, PRE_AUTHORIZED_CODE_REQUIRED_ERROR)
  }

  const credentialOfferSession = await credentialOfferSessions.getAsserted(request[PRE_AUTH_CODE_LITERAL])
  if (!isValidGrant(credentialOfferSession, request.grant_type)) {
    throw new TokenError(400, TokenErrorResponse.invalid_grant, UNSUPPORTED_GRANT_TYPE_ERROR)
  }
  /*
  invalid_request:
  the Authorization Server expects a PIN in the pre-authorized flow but the client does not provide a PIN
   */
  if (credentialOfferSession.credentialOffer.credential_offer?.grants?.[GrantTypes.PRE_AUTHORIZED_CODE]?.user_pin_required && !request.user_pin) {
    throw new TokenError(400, TokenErrorResponse.invalid_request, USER_PIN_REQUIRED_ERROR)
  }
  /*
  invalid_request:
  the Authorization Server does not expect a PIN in the pre-authorized flow but the client provides a PIN
   */
  if (!credentialOfferSession.credentialOffer.credential_offer?.grants?.[GrantTypes.PRE_AUTHORIZED_CODE]?.user_pin_required && request.user_pin) {
    throw new TokenError(400, TokenErrorResponse.invalid_request, USER_PIN_NOT_REQUIRED_ERROR)
  }
  /*
  invalid_grant:
  the Authorization Server expects a PIN in the pre-authorized flow but the client provides the wrong PIN
  the End-User provides the wrong Pre-Authorized Code or the Pre-Authorized Code has expired
   */
  if (request.user_pin && !/[0-9{,8}]/.test(request.user_pin)) {
    throw new TokenError(400, TokenErrorResponse.invalid_grant, PIN_VALIDATION_ERROR)
  } else if (request.user_pin !== credentialOfferSession.userPin) {
    throw new TokenError(400, TokenErrorResponse.invalid_grant, PIN_NOT_MATCH_ERROR)
  } else if (isPreAuthorizedCodeExpired(credentialOfferSession, expirationDuration)) {
    throw new TokenError(400, TokenErrorResponse.invalid_grant, EXPIRED_PRE_AUTHORIZED_CODE)
  } else if (
    request[PRE_AUTH_CODE_LITERAL] !==
    credentialOfferSession.credentialOffer?.credential_offer?.grants?.[GrantTypes.PRE_AUTHORIZED_CODE]?.[PRE_AUTH_CODE_LITERAL]
  ) {
    throw new TokenError(400, TokenErrorResponse.invalid_grant, INVALID_PRE_AUTHORIZED_CODE)
  }
}
