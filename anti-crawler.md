# 反爬策略设计文档

> MediaCrawler 多平台自媒体爬虫框架反爬对抗策略详解

## 1. Overview

反爬与反反爬是一个持续对抗的过程。本框架提供多层次的反爬对抗策略，帮助爬虫在主流平台获取数据。

|| 策略层级 | 技术手段 | 适用场景 | 复杂度 |
|---------|---------|---------|---------|--------|
|| 基础层 | User-Agent、请求间隔 | 低防护平台 | ★☆☆☆☆ |
|| 代理层 | 代理IP池、IP轮换 | 中等防护 | ★★☆☆☆ |
|| 浏览器层 | CDP无头浏览器 | JS渲染检测 | ★★★☆☆ |
|| 高级层 | 请求签名、设备指纹 | 高防护平台 | ★★★★☆ |

## 2. 反爬检测机制

### 2.1 常见检测手段

```
┌─────────────────────────────────────────────────────────────┐
│                      平台反爬检测手段                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│   请求特征检测   │   行为特征检测   │      环境检测           │
├─────────────────┼─────────────────┼─────────────────────────┤
│ Header完整性     │ 请求频率/规律    │ JavaScript执行环境      │
│ IP频率限制       │ 鼠标轨迹        │ Canvas/WebGL指纹        │
│ Cookie/Session  │ 页面停留时间     │ 浏览器DevTools检测      │
│ Referrer检测    │ 访问路径异常     │ 代理IP黑名单            │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 2.2 各平台反爬强度

|| 平台 | 反爬强度 | 主要检测点 | 应对难度 |
|------|---------|-----------|---------|
| 微博 | ★★★★☆ | OAuth签名、IP限制 | 高 |
| 抖音 | ★★★★☆ | X-Gorgon签名、设备指纹 | 高 |
| 小红书 | ★★★☆☆ | XHS Token、IP频率 | 中高 |
| B站 | ★★★☆☆ | BFSJ Token、登录态 | 中 |
| 快手 | ★★★☆☆ | 视频水印解析、环境检测 | 中 |
| 知乎 | ★★☆☆☆ | 盐值签名、IP限制 | 中低 |
| 贴吧 | ★★☆☆☆ | 基础检测、登录态 | 低 |

## 3. 核心反爬组件

### 3.1 CDP 浏览器模式 (Chrome DevTools Protocol)

通过无头浏览器绕过JavaScript渲染检测：

```python
class CDPClient:
    """CDP 浏览器客户端 - 核心反爬组件"""
    
    def __init__(self, 
                 headless: bool = True,
                 browser_args: List[str] = None):
        self.headless = headless
        self.browser = None
        self.context = None
        self.default_args = [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
        ]
    
    async def connect(self):
        """连接Chrome浏览器实例"""
        pass
    
    async def new_context(self, **kwargs):
        """创建新的浏览器上下文（隔离Cookie）"""
        pass
    
    async def execute_script(self, script: str):
        """执行JavaScript代码"""
        pass
    
    async def wait_for_selector(self, selector: str, timeout: int = 10):
        """等待元素出现"""
        pass
    
    async def take_screenshot(self) -> bytes:
        """页面截图（调试用）"""
        pass
```

**CDP模式优势：**

| 特性 | 说明 |
|------|------|
| JS渲染 | 执行页面JavaScript，获取动态内容 |
| 环境模拟 | 模拟完整浏览器环境 |
| 交互能力 | 可模拟点击、滚动、输入等行为 |
| 绕过检测 | 可注入脚本隐藏自动化特征 |

### 3.2 代理IP池

```python
class ProxyPool:
    """代理IP池管理器"""
    
    def __init__(self, 
                 proxy_source: str = "api",
                 validate_interval: int = 300):
        self.proxies: List[Proxy] = []
        self.failed_count: Dict[str, int] = {}
        self.validate_interval = validate_interval
        self.source = proxy_source
    
    async def add_proxy(self, proxy: Proxy):
        """添加代理IP"""
        pass
    
    async def get_proxy(self) -> Optional[Proxy]:
        """获取可用代理（自动轮换）"""
        pass
    
    async def validate_proxy(self, proxy: Proxy) -> bool:
        """验证代理可用性"""
        pass
    
    async def remove_proxy(self, proxy: Proxy):
        """移除失效代理"""
        pass
```

**代理池架构：**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  代理来源     │────▶│  代理验证     │────▶│  代理调度     │
│              │     │              │     │              │
│ - API接口导入  │     │ - 可用性检测   │     │ - 随机选取   │
│ - 付费代理服务 │     │ - 延迟测量     │     │ - 失败重试   │
│ - 免费代理网站 │     │ - 地理位置     │     │ - 自动切换   │
│ - 自建代理    │     │ - 匿名度检测   │     │ - 负载均衡   │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 3.3 请求签名器

部分平台需要特定签名算法：

```python
class RequestSigner:
    """请求签名生成器"""
    
    def __init__(self, platform: str):
        self.platform = platform
        self.sign_config = self._load_sign_config()
    
    def sign(self, 
             method: str, 
             url: str, 
             params: Dict,
             headers: Dict = None) -> Dict:
        """
        生成签名参数
        
        Args:
            method: HTTP方法
            url: 请求URL
            params: 请求参数
            headers: 请求头
        
        Returns:
            签名后的完整参数
        """
        pass
    
    def _generate_nonce(self) -> str:
        """生成随机字符串"""
        pass
    
    def _calculate_md5(self, data: str) -> str:
        """计算MD5哈希"""
        pass
    
    def _encrypt_params(self, params: Dict) -> str:
        """加密请求参数"""
        pass
```

## 4. 反爬策略配置

### 4.1 全局配置项

```yaml
# config/anti_crawler.yaml
anti_crawler:
  # CDP浏览器配置
  cdp:
    enabled: true
    headless: true
    remote_debugging_port: 9222
    browser_args:
      - "--disable-blink-features=AutomationControlled"
      - "--disable-dev-shm-usage"
      - "--no-sandbox"
      - "--disable-gpu"
    page_load_timeout: 30
    script_timeout: 20
  
  # 代理池配置
  proxy:
    enabled: true
    source: "api"  # api / file / custom
    api_url: "http://api.proxy.com/get"
    api_key: "your_api_key"
    validate_ssl: false
    max_fail_count: 3
    rotate_on_failure: true
  
  # 请求限流配置
  rate_limit:
    requests_per_second: 2
    burst_size: 5
    cooldown_on_error: 60
  
  # 重试配置
  retry:
    max_attempts: 3
    backoff_factor: 2
    retry_on_status: [429, 500, 502, 503, 504]
```

### 4.2 平台特定配置

```python
# platforms/xhs/config.py
XHSConfig = {
    "anti_crawler": {
        "use_cdp": True,           # 是否使用CDP
        "need_sign": True,         # 是否需要签名
        "sign_key": "xhs_sign_key",
        "rate_limit": {
            "requests_per_second": 1,
            "min_interval": 1.0,
        },
        "proxy": {
            "required": True,       # 强制使用代理
            "min_quality": 60,
        }
    }
}

# platforms/dy/config.py
DYConfig = {
    "anti_crawler": {
        "use_cdp": True,
        "need_sign": True,
        "xgorgon_required": True,  # X-Gorgon签名
        "device_id_required": True, # 设备ID
        "rate_limit": {
            "requests_per_second": 2,
        },
    }
}
```

## 5. 请求伪装策略

### 5.1 浏览器指纹随机化

```python
class FingerprintGenerator:
    """浏览器指纹生成器"""
    
    # 常用User-Agent列表
    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edge/120.0.0.0 Safari/537.36",
        # ... 更多UA
    ]
    
    def generate(self) -> Dict:
        """生成随机指纹"""
        return {
            "user_agent": random.choice(self.USER_AGENTS),
            "screen_resolution": random.choice(["1920x1080", "1366x768", "1440x900"]),
            "timezone": random.choice(["Asia/Shanghai", "America/New_York", "Europe/London"]),
            "language": random.choice(["zh-CN", "en-US", "zh-TW"]),
            "platform": random.choice(["Win32", "MacIntel", "Linux x86_64"]),
        }
```

### 5.2 请求头完整性

```python
class HeaderBuilder:
    """构建完整的浏览器请求头"""
    
    @staticmethod
    def build(referer: str = None) -> Dict:
        """生成完整请求头"""
        headers = {
            "User-Agent": Faker().user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
        }
        
        if referer:
            headers["Referer"] = referer
        
        return headers
```

## 6. 请求频率控制

### 6.1 令牌桶限流器

```python
import time
import asyncio
from threading import Lock

class TokenBucket:
    """令牌桶算法实现"""
    
    def __init__(self, rate: float, capacity: int):
        """
        Args:
            rate: 每秒生成的令牌数
            capacity: 桶的容量
        """
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.time()
        self.lock = Lock()
    
    async def acquire(self, tokens: int = 1):
        """获取令牌（阻塞直到获取成功）"""
        while True:
            with self.lock:
                now = time.time()
                elapsed = now - self.last_update
                self.tokens = min(
                    self.capacity,
                    self.tokens + elapsed * self.rate
                )
                self.last_update = now
                
                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return
            
            await asyncio.sleep(0.1)
```

### 6.2 平台级并发控制

```python
class PlatformRateLimiter:
    """平台级别请求限速器"""
    
    def __init__(self):
        self.limiters: Dict[str, TokenBucket] = {}
        self.config = {
            "xhs": {"rate": 1, "capacity": 3},      # 小红书：每秒1请求
            "dy": {"rate": 2, "capacity": 5},        # 抖音：每秒2请求
            "ks": {"rate": 1, "capacity": 2},        # 快手：每秒1请求
            "bilibili": {"rate": 3, "capacity": 10}, # B站：每秒3请求
            "weibo": {"rate": 2, "capacity": 5},      # 微博：每秒2请求
        }
    
    async def acquire(self, platform: str):
        """获取指定平台的请求令牌"""
        if platform not in self.limiters:
            cfg = self.config.get(platform, {"rate": 1, "capacity": 3})
            self.limiters[platform] = TokenBucket(cfg["rate"], cfg["capacity"])
        
        await self.limiters[platform].acquire()
```

## 7. 异常处理与降级

### 7.1 错误类型与策略

```python
class AntiCrawlerError(Exception):
    """反爬相关异常基类"""
    pass

class ProxyError(AntiCrawlerError):
    """代理相关错误"""
    pass

class SignError(AntiCrawlerError):
    """签名验证错误"""
    pass

class RateLimitError(AntiCrawlerError):
    """请求频率超限"""
    pass

class CDPBrowserError(AntiCrawlerError):
    """浏览器自动化错误"""
    pass
```

### 7.2 自动降级策略

```
┌──────────────────────────────────────────────────────────────┐
│                       请求流程                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 尝试直连 + 基础Header                                      │
│           │                                                  │
│           ▼                                                  │
│      成功? ──是──▶ 返回结果                                    │
│           │                                                  │
│          否                                                   │
│           │                                                  │
│           ▼                                                  │
│  2. 启用CDP浏览器 + 代理                                       │
│           │                                                  │
│           ▼                                                  │
│      成功? ──是──▶ 返回结果                                    │
│           │                                                  │
│          否                                                   │
│           │                                                  │
│           ▼                                                  │
│  3. 更换代理 + 增加延迟                                        │
│           │                                                  │
│           ▼                                                  │
│      成功? ──是──▶ 返回结果                                    │
│           │                                                  │
│          否                                                   │
│           │                                                  │
│           ▼                                                  │
│  4. 降级请求频率 + 等待冷却                                    │
│           │                                                  │
│           ▼                                                  │
│      成功? ──是──▶ 返回结果                                    │
│           │                                                  │
│          否                                                   │
│           │                                                  │
│           ▼                                                  │
│  5. 返回错误 / 人工介入                                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 8. Cookie 管理

### 8.1 Cookie 存储与刷新

```python
class CookieManager:
    """Cookie 管理器"""
    
    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        self.cookies: Dict[str, Dict] = {}
        self.expire_times: Dict[str, float] = {}
    
    async def load_cookies(self, platform: str) -> Dict:
        """加载平台Cookie"""
        pass
    
    async def save_cookies(self, platform: str, cookies: Dict):
        """保存Cookie到本地"""
        pass
    
    async def is_expired(self, platform: str) -> bool:
        """检查Cookie是否过期"""
        pass
    
    async def refresh_if_needed(self, platform: str) -> bool:
        """必要时自动刷新Cookie"""
        pass
    
    def get_random_cookie(self, platform: str) -> Optional[Dict]:
        """从池中获取随机Cookie（负载均衡）"""
        pass
```

### 8.2 Cookie 池策略

```
┌─────────────────────────────────────────────────────────────┐
│                    Cookie 池管理策略                          │
├─────────────────┬───────────────────────────────────────────┤
│   数量策略       │  每个平台维护 3-5 个可用Cookie              │
├─────────────────┼───────────────────────────────────────────┤
│   轮换策略       │  随机选取，避免同一Cookie高频使用            │
├─────────────────┼───────────────────────────────────────────┤
│   淘汰策略       │  失败一次降权，连续失败3次移除                │
├─────────────────┼───────────────────────────────────────────┤
│   刷新策略       │  过期前30分钟自动刷新                        │
├─────────────────┼───────────────────────────────────────────┤
│   隔离策略       │  不同平台Cookie完全隔离                      │
└─────────────────┴───────────────────────────────────────────┘
```

## 9. 最佳实践

### 9.1 爬取策略建议

| 场景 | 策略建议 |
|------|---------|
| 小规模数据采集 | 使用基础HTTP客户端，控制请求间隔 |
| 中等规模采集 | 启用CDP模式，使用普通代理 |
| 大规模持续采集 | CDP + 高质量代理 + Cookie池 + 请求签名 |
| 高防护平台 | 全套策略 + 降低频率 + 智能重试 |

### 9.2 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 请求被拦截 | IP被封禁 | 切换代理IP |
| 页面为空 | JS未执行完成 | 增加等待时间或使用CDP |
| 签名验证失败 | 签名算法过时 | 更新签名算法 |
| Cookie失效 | 登录态过期 | 重新获取Cookie |
| 账号被限制 | 请求过于频繁 | 降低请求频率 |

### 9.3 配置检查清单

- [ ] User-Agent 设置正确且定期更换
- [ ] 请求间隔合理（建议 1-3 秒）
- [ ] 代理IP质量可靠
- [ ] Cookie 未过期
- [ ] 平台签名算法已更新
- [ ] 限流策略已配置
- [ ] 错误重试机制已启用
- [ ] 日志记录完整

## 10. 道德与法律声明

> **重要提示**：本框架仅供学习研究使用，请遵守以下原则：

1. **遵守robots.txt协议**：尊重网站的爬虫协议
2. **控制请求频率**：避免对目标网站造成负担
3. **仅获取公开数据**：不爬取私人或敏感信息
4. **遵守当地法律**：确保爬虫行为合法合规
5. **不承担连带责任**：因滥用本框架导致的法律问题由使用者自行负责

---

*本文档会随框架更新持续完善，如有疑问请提交Issue。*
