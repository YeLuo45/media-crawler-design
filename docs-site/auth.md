# 认证方式设计

> MediaCrawler 多平台自媒体爬虫框架认证体系设计分析

## 1. Overview

MediaCrawler 支持三种认证方式，适用于不同场景：

| 认证方式 | 适用场景 | 复杂度 | 稳定性 | 需要人工干预 |
|---------|---------|--------|--------|-------------|
| 二维码登录 (QR Code) | 临时少量爬取 | ★☆☆☆☆ | ★★★★☆ | 是 |
| 手机号登录 (SMS) | 需要短信验证的平台 | ★★★☆☆ | ★★★★☆ | 是 |
| Cookie 登录 | 生产环境、批量爬取 | ★★☆☆☆ | ★★★★★ | 否 |

## 2. 认证体系架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         认证体系架构                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ AuthManager │───▶│ QRLogin     │    │ SMSLogin    │             │
│  │             │    │ (BaseAuth)  │    │ (BaseAuth)  │             │
│  └──────┬──────┘    └─────────────┘    └─────────────┘             │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │CookieManager│◀───│ LoginContext│    │ TokenManager│             │
│  │             │    │             │    │             │             │
│  └──────┬──────┘    └─────────────┘    └─────────────┘             │
│         │                                                          │
└─────────┼───────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      平台具体实现                                     │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────┤
│  小红书   │   抖音   │   快手   │   B站    │   微博   │   知乎     │
│  XHS     │   DY     │   KS     │ Bilibili │  Weibo   │   Zhihu    │
└──────────┴──────────┴──────────┴──────────┴──────────┴─────────────┘
```

## 3. 认证抽象层

### 3.1 认证基类

```python
class BaseAuth(ABC):
    """认证抽象基类"""
    
    def __init__(self, platform: str):
        self.platform = platform
        self.context: Optional[LoginContext] = None
    
    @abstractmethod
    async def login(self, **kwargs) -> bool:
        """执行登录"""
        pass
    
    @abstractmethod
    async def verify(self) -> bool:
        """验证登录状态"""
        pass
    
    @abstractmethod
    async def refresh(self) -> bool:
        """刷新认证状态"""
        pass
    
    @property
    @abstractmethod
    def auth_type(self) -> str:
        """返回认证类型"""
        pass
```

### 3.2 登录上下文

```python
@dataclass
class LoginContext:
    """登录上下文"""
    platform: str
    auth_type: str                      # qr / sms / cookie
    cookies: Dict[str, str]
    headers: Dict[str, str]
    tokens: Dict[str, str]
    user_info: Optional[UserInfo]
    expires_at: Optional[datetime]
    extra_data: Dict[str, Any]          # 平台特定的额外数据
    
    def is_expired(self) -> bool:
        """检查是否过期"""
        if self.expires_at is None:
            return False
        return datetime.now() >= self.expires_at
    
    def to_dict(self) -> Dict:
        """序列化为字典"""
        return {
            'platform': self.platform,
            'auth_type': self.auth_type,
            'cookies': self.cookies,
            'headers': self.headers,
            'tokens': self.tokens,
            'user_info': self.user_info.__dict__ if self.user_info else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'extra_data': self.extra_data
        }
```

## 4. 二维码登录 (QR Code Login)

### 4.1 流程图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  生成二维码   │────▶│  扫描二维码   │────▶│  确认登录    │
│  (QR Code)   │     │  (Scan)      │     │  (Confirm)   │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  保存认证信息  │◀────│  获取Token   │◀────│  获取Cookie  │
│  (Save Auth) │     │  (GetToken)  │     │  (GetCookie) │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 4.2 实现

```python
class QRLogin(BaseAuth):
    """二维码登录"""
    
    @property
    def auth_type(self) -> str:
        return "qr"
    
    async def login(self, **kwargs) -> bool:
        """执行二维码登录流程"""
        # 1. 获取二维码
        qr_data = await self._fetch_qr_code()
        
        # 2. 显示二维码 (可保存为图片或返回base64)
        self._display_qr_code(qr_data)
        
        # 3. 轮询等待扫码
        result = await self._poll_scan_status()
        
        if result['status'] == 'confirmed':
            # 4. 获取认证信息
            await self._fetch_auth_data(result['token'])
            return True
        return False
    
    async def _fetch_qr_code(self) -> str:
        """获取二维码"""
        pass
    
    async def _poll_scan_status(self) -> Dict:
        """轮询扫码状态"""
        pass
    
    async def _fetch_auth_data(self, token: str):
        """获取认证数据"""
        pass
```

### 4.3 平台适配

| 平台 | 二维码登录支持 | 特殊处理 |
|------|--------------|---------|
| 微博 | ✅ 完整支持 | OAuth 2.0 流程 |
| B站 | ✅ 完整支持 | 需要 BFSJ Token |
| 知乎 | ✅ 完整支持 | 盐值签名验证 |
| 小红书 | ❌ 不支持 | 仅 Cookie |
| 抖音 | ❌ 不支持 | 仅 Cookie |
| 快手 | ❌ 不支持 | 仅 Cookie |

## 5. 手机号登录 (SMS Login)

### 5.1 流程图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  获取手机号   │────▶│  发送验证码   │────▶│  验证验证码   │
│  (Input)     │     │  (Send SMS)  │     │  (Verify)    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  保存认证信息  │◀────│  获取Token   │◀────│  登录成功    │
│  (Save Auth) │     │  (GetToken)  │     │  (Success)   │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 5.2 实现

```python
class SMSLogin(BaseAuth):
    """短信登录"""
    
    def __init__(self, platform: str):
        super().__init__(platform)
        self.phone: Optional[str] = None
        self.sms_code: Optional[str] = None
    
    @property
    def auth_type(self) -> str:
        return "sms"
    
    async def login(self, phone: str, **kwargs) -> bool:
        """执行短信登录"""
        self.phone = phone
        
        # 1. 发送验证码
        await self._send_sms(phone)
        
        # 2. 等待用户输入验证码
        sms_code = kwargs.get('sms_code')
        if not sms_code:
            raise ValueError("SMS code required")
        
        # 3. 验证验证码
        return await self._verify_sms(phone, sms_code)
    
    async def _send_sms(self, phone: str) -> bool:
        """发送短信验证码"""
        pass
    
    async def _verify_sms(self, phone: str, code: str) -> bool:
        """验证短信验证码"""
        pass
```

### 5.3 平台适配

| 平台 | 短信登录支持 | 特殊处理 |
|------|-------------|---------|
| 小红书 | ✅ 完整支持 | 需要 XHS Token |
| 微博 | ✅ 完整支持 | OAuth + SMS |
| 知乎 | ✅ 完整支持 | 密码+短信双重 |
| 抖音 | ⚠️ 部分支持 | 需平台SDK |
| 快手 | ⚠️ 部分支持 | 需平台SDK |
| B站 | ❌ 不支持 | 仅二维码/Cookie |

## 6. Cookie 登录 (Cookie Login)

### 6.1 流程图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  加载Cookie  │────▶│  验证Cookie   │────▶│  更新Headers │
│  (Load)      │     │  (Validate)  │     │  (Update)    │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                     ┌──────────────┐
                     │  有效/失效   │
                     │ (Valid/Inv) │
                     └──────────────┘
```

### 6.2 实现

```python
class CookieLogin(BaseAuth):
    """Cookie 登录"""
    
    @property
    def auth_type(self) -> str:
        return "cookie"
    
    async def login(self, cookies: Dict = None, cookie_file: str = None, **kwargs) -> bool:
        """执行 Cookie 登录"""
        # 1. 加载 Cookie
        if cookies:
            self.context.cookies = cookies
        elif cookie_file:
            self.context.cookies = await self._load_from_file(cookie_file)
        else:
            raise ValueError("Cookies or cookie_file required")
        
        # 2. 验证 Cookie
        if not await self.verify():
            # 3. 尝试刷新
            if kwargs.get('auto_refresh', True):
                await self.refresh()
            else:
                return False
        
        return True
    
    async def verify(self) -> bool:
        """验证 Cookie 有效性"""
        pass
    
    async def refresh(self) -> bool:
        """刷新 Cookie"""
        pass
```

## 7. Cookie 管理器

### 7.1 核心功能

```python
class CookieManager:
    """Cookie 管理器"""
    
    def __init__(self, storage_path: str):
        self.storage_path = Path(storage_path)
        self.cookies: Dict[str, LoginContext] = {}
        self._lock = asyncio.Lock()
    
    async def load_cookies(self, platform: str) -> Optional[LoginContext]:
        """加载指定平台的 Cookie"""
        async with self._lock:
            if platform in self.cookies:
                return self.cookies[platform]
            
            cookie_file = self.storage_path / f"{platform}_cookies.json"
            if cookie_file.exists():
                data = json.loads(cookie_file.read_text())
                ctx = LoginContext(**data)
                self.cookies[platform] = ctx
                return ctx
            return None
    
    async def save_cookies(self, platform: str, context: LoginContext):
        """保存 Cookie"""
        async with self._lock:
            self.cookies[platform] = context
            cookie_file = self.storage_path / f"{platform}_cookies.json"
            cookie_file.parent.mkdir(parents=True, exist_ok=True)
            cookie_file.write_text(json.dumps(context.to_dict(), indent=2, ensure_ascii=False))
    
    async def delete_cookies(self, platform: str):
        """删除 Cookie"""
        async with self._lock:
            if platform in self.cookies:
                del self.cookies[platform]
            cookie_file = self.storage_path / f"{platform}_cookies.json"
            if cookie_file.exists():
                cookie_file.unlink()
    
    async def refresh_if_needed(self, platform: str) -> bool:
        """必要时刷新 Cookie"""
        context = await self.load_cookies(platform)
        if not context:
            return False
        
        if context.is_expired():
            # 根据认证类型刷新
            if context.auth_type == "cookie":
                auth = CookieLogin(platform)
                auth.context = context
                return await auth.refresh()
            elif context.auth_type == "qr":
                auth = QRLogin(platform)
                auth.context = context
                return await auth.refresh()
            elif context.auth_type == "sms":
                auth = SMSLogin(platform)
                auth.context = context
                return await auth.refresh()
        
        return True
```

### 7.2 Cookie 存储格式

```json
{
  "platform": "xhs",
  "auth_type": "cookie",
  "cookies": {
    "web_session": "040069b8xxxxx",
    "a1": "18b38xxxxx",
    "webId": "xxxxx"
  },
  "headers": {
    "User-Agent": "Mozilla/5.0 ...",
    "Referer": "https://www.xiaohongshu.com/"
  },
  "tokens": {
    "xhs_token": "xxxxx"
  },
  "user_info": {
    "user_id": "5a7xxxxx",
    "nickname": "用户昵称",
    "avatar": "https://..."
  },
  "expires_at": "2024-12-31T23:59:59",
  "extra_data": {
    "device_id": "xxxxx"
  }
}
```

## 8. 认证管理器

### 8.1 统一认证接口

```python
class AuthManager:
    """认证管理器 - 统一入口"""
    
    def __init__(self, config: AuthConfig):
        self.config = config
        self.cookie_manager = CookieManager(config.storage_path)
        self.platform_auths: Dict[str, BaseAuth] = {}
    
    async def get_or_login(self, platform: str, **kwargs) -> LoginContext:
        """获取或执行登录"""
        # 1. 尝试加载已有认证
        context = await self.cookie_manager.load_cookies(platform)
        
        if context and not context.is_expired():
            # 验证是否仍然有效
            if await self._verify_context(context):
                return context
        
        # 2. 执行新的登录
        context = await self.login(platform, **kwargs)
        return context
    
    async def login(self, platform: str, **kwargs) -> LoginContext:
        """执行登录"""
        auth_type = kwargs.get('auth_type', self.config.default_auth_type)
        
        if auth_type == 'qr':
            auth = QRLogin(platform)
        elif auth_type == 'sms':
            auth = SMSLogin(platform)
        elif auth_type == 'cookie':
            auth = CookieLogin(platform)
        else:
            raise ValueError(f"Unknown auth type: {auth_type}")
        
        # 执行登录
        success = await auth.login(**kwargs)
        if not success:
            raise AuthError(f"Login failed for {platform}")
        
        # 保存认证信息
        await self.cookie_manager.save_cookies(platform, auth.context)
        return auth.context
    
    async def _verify_context(self, context: LoginContext) -> bool:
        """验证认证上下文"""
        pass
```

### 8.2 配置

```python
@dataclass
class AuthConfig:
    """认证配置"""
    storage_path: str = "./cookies"           # Cookie 存储路径
    default_auth_type: str = "cookie"         # 默认认证方式
    cookie_refresh_threshold: int = 3600      # 提前多少秒刷新
    auto_refresh: bool = True                # 是否自动刷新
    max_retry: int = 3                        # 最大重试次数
    
    # 平台特定配置
    platform_configs: Dict[str, Dict] = field(default_factory=dict)
```

## 9. 平台认证特性

### 9.1 各平台认证对比

| 平台 | QR登录 | SMS登录 | Cookie登录 | Token类型 | 有效期 |
|------|-------|--------|-----------|----------|-------|
| 小红书 | ❌ | ✅ | ✅ | XHS Token | 30天 |
| 抖音 | ❌ | ⚠️ | ✅ | API Signature | 7天 |
| 快手 | ❌ | ⚠️ | ✅ | KsToken | 15天 |
| B站 | ✅ | ❌ | ✅ | BFSJ Token | 7天 |
| 微博 | ✅ | ✅ | ✅ | OAuth Token | 不定 |
| 知乎 | ✅ | ✅ | ✅ | 知乎Token | 30天 |
| 贴吧 | ❌ | ❌ | ✅ | 百度Cookie | 7天 |

### 9.2 平台特殊处理

#### 小红书 (XHS)

```python
class XHSAuth(CookieLogin):
    """小红书认证"""
    
    async def _build_headers(self) -> Dict:
        """构建小红书专用 headers"""
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
            'Cookie': self._format_cookies(),
            'X-Token': self.context.tokens.get('xhs_token'),
            'X-Biz-Version': '1.0',
            'X-Android-Packname': 'com.xingin.xhs',
            'X-Android-Ver': '10.5.1',
        }
```

#### 抖音 (DY)

```python
class DYAuth(CookieLogin):
    """抖音认证"""
    
    async def login(self, **kwargs) -> bool:
        """抖音需要额外的签名"""
        success = await super().login(**kwargs)
        if success:
            # 生成设备签名
            await self._update_device_signature()
        return success
```

#### B站 (Bilibili)

```python
class BilibiliAuth(QRLogin):
    """B站认证 - 二维码登录为主"""
    
    async def _poll_scan_status(self) -> Dict:
        """B站扫码状态轮询"""
        # B站二维码状态: 0=未扫码, 1=已扫码待确认, 2=已确认, 3=过期
        status = await self._get_qr_status()
        return status
    
    async def _fetch_auth_data(self, oauth_token: str):
        """获取 B站 BFSJ Token"""
        self.context.tokens['bfsj_token'] = await self._get_bfsj_token(oauth_token)
```

## 10. 安全最佳实践

### 10.1 Cookie 安全

```python
class SecureCookieManager(CookieManager):
    """安全的 Cookie 管理器"""
    
    def __init__(self, storage_path: str, encrypt_key: bytes = None):
        super().__init__(storage_path)
        self.encrypt_key = encrypt_key or os.urandom(32)
    
    async def save_cookies(self, platform: str, context: LoginContext):
        """加密保存 Cookie"""
        data = context.to_dict()
        # 加密敏感字段
        data['cookies'] = self._encrypt(json.dumps(data['cookies']))
        data['tokens'] = self._encrypt(json.dumps(data['tokens']))
        
        encrypted = self._encrypt(json.dumps(data))
        # 保存加密后的数据
        cookie_file = self.storage_path / f"{platform}_cookies.enc"
        cookie_file.write_text(base64.b64encode(encrypted).decode())
    
    def _encrypt(self, data: str) -> str:
        """AES 加密"""
        from cryptography.fernet import Fernet
        f = Fernet(self.encrypt_key)
        return f.encrypt(data.encode()).decode()
    
    def _decrypt(self, data: str) -> str:
        """AES 解密"""
        from cryptography.fernet import Fernet
        f = Fernet(self.encrypt_key)
        return f.decrypt(data.encode()).decode()
```

### 10.2 建议

1. **生产环境使用 Cookie 登录** - 稳定性最高
2. **定期刷新 Cookie** - 避免过期导致爬取中断
3. **加密存储敏感信息** - 防止 Cookie 泄露
4. **多账号轮换** - 降低单账号被封风险
5. **设置合理的并发** - 避免触发反爬机制
