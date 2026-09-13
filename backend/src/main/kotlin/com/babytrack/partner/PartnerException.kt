package com.babytrack.partner

class PartnerInviteNotFoundException(message: String) : RuntimeException(message)
class PartnerInviteExpiredException(message: String) : RuntimeException(message)
class AlreadyLinkedException(message: String) : RuntimeException(message)
