import base64
import hashlib
import hmac
import os
import unittest

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.core.config import settings
from app.services.chat_crypto import (
    decrypt_message_body,
    decrypt_message_body_for_request,
    encrypt_message_body,
    encrypt_message_body_for_request,
    extract_message_kid,
)
from app.services.invoice_crypto import (
    active_requisites_kid,
    decrypt_requisites,
    encrypt_requisites,
    extract_requisites_kid,
)


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _legacy_invoice_token(payload: dict, secret: str) -> str:
    raw = (str(payload).replace("'", '"')).encode("utf-8")
    # stable json-like payload for this test suite
    raw = b'{"secret":"LEGACY"}' if payload.get("secret") == "LEGACY" else raw
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    nonce = bytes.fromhex("00112233445566778899aabbccddeeff")
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(key, b"v1" + nonce + cipher, hashlib.sha256).digest()
    token = b"v1" + nonce + tag + cipher
    return base64.urlsafe_b64encode(token).decode("ascii")


def _legacy_chat_token(plaintext: str, secret: str) -> str:
    raw = plaintext.encode("utf-8")
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    nonce = bytes.fromhex("ffeeddccbbaa99887766554433221100")
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(key, b"v1" + nonce + cipher, hashlib.sha256).digest()
    token = b"v1" + nonce + tag + cipher
    return "chatenc:v1:" + base64.urlsafe_b64encode(token).decode("ascii")


class CryptoKidRotationTests(unittest.TestCase):
    def setUp(self):
        self._backup = {
            "DATA_ENCRYPTION_SECRET": settings.DATA_ENCRYPTION_SECRET,
            "DATA_ENCRYPTION_ACTIVE_KID": settings.DATA_ENCRYPTION_ACTIVE_KID,
            "DATA_ENCRYPTION_KEYS": settings.DATA_ENCRYPTION_KEYS,
            "CHAT_ENCRYPTION_SECRET": settings.CHAT_ENCRYPTION_SECRET,
            "CHAT_ENCRYPTION_ACTIVE_KID": settings.CHAT_ENCRYPTION_ACTIVE_KID,
            "CHAT_ENCRYPTION_KEYS": settings.CHAT_ENCRYPTION_KEYS,
        }

    def tearDown(self):
        for key, value in self._backup.items():
            setattr(settings, key, value)

    def test_invoice_encrypt_uses_active_kid(self):
        settings.DATA_ENCRYPTION_SECRET = "legacy-secret-1234567890"
        settings.DATA_ENCRYPTION_ACTIVE_KID = "k2"
        settings.DATA_ENCRYPTION_KEYS = "k1=old-secret-1111111111111111,k2=new-secret-2222222222222222"

        token = encrypt_requisites({"inn": "7700000000"})
        self.assertTrue(token.startswith("invenc:v2:"))
        self.assertEqual(extract_requisites_kid(token), "k2")
        payload = decrypt_requisites(token)
        self.assertEqual(payload.get("inn"), "7700000000")
        self.assertEqual(active_requisites_kid(), "k2")

    def test_invoice_decrypts_legacy_after_rotation(self):
        legacy_secret = "legacy-data-secret-aaaaaaaaaaaaaaaa"
        legacy = _legacy_invoice_token({"secret": "LEGACY"}, legacy_secret)

        settings.DATA_ENCRYPTION_SECRET = ""
        settings.DATA_ENCRYPTION_ACTIVE_KID = "k2"
        settings.DATA_ENCRYPTION_KEYS = f"k1={legacy_secret},k2=new-data-secret-bbbbbbbbbbbbbbbb"

        payload = decrypt_requisites(legacy)
        self.assertEqual(payload.get("secret"), "LEGACY")

        rotated = encrypt_requisites(payload)
        self.assertEqual(extract_requisites_kid(rotated), "k2")
        self.assertEqual(decrypt_requisites(rotated).get("secret"), "LEGACY")

    def test_chat_decrypts_legacy_and_writes_new_kid(self):
        legacy_secret = "legacy-chat-secret-aaaaaaaaaaaaaaaa"
        legacy_token = _legacy_chat_token("legacy message", legacy_secret)

        settings.DATA_ENCRYPTION_SECRET = ""
        settings.DATA_ENCRYPTION_ACTIVE_KID = "k2"
        settings.DATA_ENCRYPTION_KEYS = "k2=new-data-secret-bbbbbbbbbbbbbbbb"
        settings.CHAT_ENCRYPTION_SECRET = ""
        settings.CHAT_ENCRYPTION_ACTIVE_KID = "k2"
        settings.CHAT_ENCRYPTION_KEYS = f"k1={legacy_secret},k2=new-chat-secret-cccccccccccccccc"

        plain = decrypt_message_body(legacy_token)
        self.assertEqual(plain, "legacy message")

        token = encrypt_message_body(plain)
        self.assertTrue(token.startswith("chatenc:v2:"))
        self.assertEqual(extract_message_kid(token), "k2")
        self.assertEqual(decrypt_message_body(token), "legacy message")

    def test_chat_request_crypto_uses_per_chat_v3_format(self):
        settings.DATA_ENCRYPTION_SECRET = ""
        settings.DATA_ENCRYPTION_ACTIVE_KID = "k2"
        settings.DATA_ENCRYPTION_KEYS = "k2=new-data-secret-bbbbbbbbbbbbbbbb"
        settings.CHAT_ENCRYPTION_SECRET = ""
        settings.CHAT_ENCRYPTION_ACTIVE_KID = "k2"
        settings.CHAT_ENCRYPTION_KEYS = "k2=new-chat-secret-cccccccccccccccc"

        token, extra_fields, changed = encrypt_message_body_for_request("request scoped", request_extra_fields={})
        self.assertTrue(changed)
        self.assertTrue(str(token).startswith("chatenc:v3:"))
        self.assertEqual(extract_message_kid(token), "k2")
        self.assertTrue(bool((extra_fields or {}).get("chat_crypto")))
        self.assertEqual(
            decrypt_message_body_for_request(token, request_extra_fields=extra_fields),
            "request scoped",
        )


if __name__ == "__main__":
    unittest.main()
