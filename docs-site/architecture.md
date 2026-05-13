# 系统架构

> MediaCrawler 多平台自媒体爬虫框架核心架构设计分析

## 1. Overview

MediaCrawler 是一个基于 NanmiCoder/MediaCrawler 源码架构分析的多平台爬虫框架，核心特点：

| 指标 | 数值 |
|------|------|
| 支持平台 | 7 大平台 |
| 认证方式 | 3 种（二维码/手机号/Cookie） |
| 存储后端 | 7 种（CSV/JSON/JSONL/SQLite/MySQL/MongoDB/Excel） |
| 反爬策略 | CDP 模式 + 代理IP + 请求签名 |
| 架构模式 | 工厂模式 + 抽象基类 |

## 2. 核心架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         media_crawler                               │
│                        (Entry Point / CLI)                          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        Platform Factory                             │
│                  (PlatformFactory / create_platform)                │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
        ┌──────────┬──────────┬──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼          ▼
   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │小红书   │ │ 抖音   │ │ 快手   │ │  B站   │ │ 微博   │ │ 知乎   │
   │Platform│ │Platform│ │Platform│ │Platform│ │Platform│ │Platform│
   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

## 3. 核心模块设计

### 3.1 平台抽象层 (Platform Base)

所有平台实现继承自统一的抽象基类，保证接口一致性：

```python
class BasePlatform(ABC):
    """平台抽象基类"""
    
    @abstractmethod
    async def search(self, keyword: str, **kwargs) -> List[Post]:
        """搜索帖子"""
        pass
    
    @abstractmethod
    async def get_user_posts(self, user_id: str, **kwargs) -> List[Post]:
        """获取用户帖子"""
        pass
    
    @abstractmethod
    async def get_post_detail(self, post_id: str, **kwargs) -> PostDetail:
        """获取帖子详情"""
        pass
    
    @abstractmethod
    async def login(self, **kwargs) -> bool:
        """登录认证"""
        pass
```

### 3.2 工厂模式 (Factory Pattern)

通过工厂模式统一创建平台实例：

```python
class PlatformFactory:
    """平台工厂类"""
    
    _platforms: Dict[str, Type[BasePlatform]] = {}
    
    @classmethod
    def register(cls, name: str, platform_class: Type[BasePlatform]):
        """注册平台"""
        cls._platforms[name] = platform_class
    
    @classmethod
    def create(cls, name: str, **kwargs) -> BasePlatform:
        """创建平台实例"""
        if name not in cls._platforms:
            raise ValueError(f"Unknown platform: {name}")
        return cls._platforms[name](**kwargs)
```

### 3.3 数据模型 (Data Models)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Post     │     │  UserInfo   │     │ Comment     │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ post_id     │     │ user_id     │     │ comment_id  │
│ title       │     │ nickname    │     │ post_id     │
│ content     │     │ avatar      │     │ user_id     │
│ author      │────▶│ followers   │     │ content     │
│ publish_time│     │ following   │     │ like_count  │
│ like_count  │     └─────────────┘     │ create_time │
│ comment_cnt │                           └─────────────┘
│ share_count │
└─────────────┘
```

### 3.4 存储后端 (Storage Backend)

支持多种存储后端，通过统一接口切换：

| 存储类型 | 适用场景 | 配置复杂度 |
|---------|---------|-----------|
| CSV/JSON/JSONL | 小规模、临时数据 | ★☆☆☆☆ |
| SQLite | 单机中小规模 | ★★☆☆☆ |
| MySQL | 生产环境、分布式 | ★★★☆☆ |
| MongoDB | 非结构化数据 | ★★★☆☆ |
| Excel | 运营报表、分析 | ★☆☆☆☆ |

```python
class BaseStorage(ABC):
    """存储抽象基类"""
    
    @abstractmethod
    async def save_posts(self, posts: List[Post]):
        pass
    
    @abstractmethod
    async def save_users(self, users: List[UserInfo]):
        pass
    
    @abstractmethod
    async def save_comments(self, comments: List[Comment]):
        pass
```

## 4. 认证体系

### 4.1 三种认证方式

```
┌─────────────────────────────────────────────────────────────┐
│                      认证方式选择                            │
├─────────────────┬─────────────────┬─────────────────────────┤
│   二维码登录     │    手机号登录    │      Cookie 登录         │
│   (QR Code)     │  (SMS Code)     │    (Cookie Pool)        │
├─────────────────┼─────────────────┼─────────────────────────┤
│ 交互式操作      │ 需要平台SDK支持   │ 可批量导入、复用         │
│ 无需手机号      │ 需要接收短信     │ 配置简单、稳定性高        │
│ 操作简单       │ 实现复杂         │ 推荐生产环境使用          │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 4.2 Cookie 管理

```python
class CookieManager:
    """Cookie 管理器"""
    
    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        self.cookies = {}
    
    async def load_cookies(self, platform: str) -> Dict:
        """加载 Cookie"""
        pass
    
    async def save_cookies(self, platform: str, cookies: Dict):
        """保存 Cookie"""
        pass
    
    async def refresh_if_needed(self, platform: str) -> bool:
        """必要时刷新 Cookie"""
        pass
```

## 5. 反爬对抗策略

### 5.1 CDP 模式 (Chrome DevTools Protocol)

使用无头浏览器模式绕过基础反爬：

```python
class CDPClient:
    """CDP 浏览器客户端"""
    
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser = None
        self.context = None
    
    async def connect(self):
        """连接浏览器"""
        pass
    
    async def execute_script(self, script: str):
        """执行 JavaScript"""
        pass
```

### 5.2 代理 IP 池

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  代理池管理   │────▶│  代理验证     │────▶│  代理调度    │
│              │     │              │     │              │
│ - API 导入    │     │ - 可用性检测   │     │ - 自动切换   │
│ - 付费代理    │     │ - 延迟检测     │     │ - 失败重试   │
│ - 免费代理    │     │ - 地理位置     │     │ - 负载均衡   │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 5.3 请求签名

部分平台需要请求签名验证：

```python
class RequestSigner:
    """请求签名器"""
    
    def sign(self, method: str, url: str, params: Dict) -> Dict:
        """生成签名参数"""
        pass
    
    def verify(self, response) -> bool:
        """验证响应签名"""
        pass
```

## 6. 异步并发模型

### 6.1 基于 asyncio 的并发

```python
class CrawlerScheduler:
    """爬虫调度器"""
    
    def __init__(self, max_concurrency: int = 10):
        self.max_concurrency = max_concurrency
        self.semaphore = asyncio.Semaphore(max_concurrency)
    
    async def crawl_user_posts(self, user_id: str):
        async with self.semaphore:
            # 并发控制下的爬取逻辑
            pass
    
    async def run(self, tasks: List[Task]):
        """批量执行任务"""
        await asyncio.gather(*tasks)
```

### 6.2 数据流 Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Request    │───▶│  Response   │───▶│  Parser     │───▶│  Storage    │
│  Builder    │    │  Handler    │    │             │    │  Backend    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
   参数签名           异常重试           数据清洗           批量写入
   代理选择           Cookie刷新         字段标准化         断点续传
```

## 7. 目录结构

```
media-crawler/
├── core/                        # 核心模块
│   ├── platform/               # 平台抽象层
│   │   ├── base.py           # 平台基类
│   │   ├── factory.py        # 工厂类
│   │   └── registry.py       # 平台注册表
│   ├── auth/                  # 认证模块
│   │   ├── base.py           # 认证基类
│   │   ├── qr_login.py       # 二维码登录
│   │   ├── sms_login.py      # 短信登录
│   │   └── cookie_manager.py # Cookie管理
│   ├── storage/              # 存储模块
│   │   ├── base.py           # 存储基类
│   │   ├── csv_storage.py    # CSV存储
│   │   ├── json_storage.py   # JSON存储
│   │   ├── mysql_storage.py  # MySQL存储
│   │   └── mongodb_storage.py# MongoDB存储
│   └── anti_crawler/         # 反爬模块
│       ├── cdp_client.py     # CDP客户端
│       ├── proxy_pool.py     # 代理池
│       └── request_signer.py # 请求签名
│
├── platforms/                  # 平台实现
│   ├── xhs/                   # 小红书
│   │   ├── client.py
│   │   ├── parser.py
│   │   └── config.py
│   ├── dy/                    # 抖音
│   ├── ks/                    # 快手
│   ├── bilibili/              # B站
│   ├── weibo/                 # 微博
│   ├── tieba/                 # 百度贴吧
│   └── zhihu/                 # 知乎
│
├── cli/                        # 命令行入口
│   └── main.py
│
└── config/                     # 配置文件
    └── settings.py
```

## 8. 平台实现要点

| 平台 | 认证方式 | 特殊处理 | 数据特点 |
|------|---------|---------|---------|
| 小红书 | Cookie | XHS Token | 笔记为主 |
| 抖音 | Cookie | API签名 | 视频链接需解析 |
| 快手 | Cookie | 视频水印 | 关注关系复杂 |
| B站 | Cookie | BFSJ Token | 评论嵌套 |
| 微博 | QR Code | OAuth | 长文本支持 |
| 贴吧 | Cookie | 吧务系统 | 层级结构 |
| 知乎 | Cookie | 盐值签名 | 回答折叠 |

## 9. 技术栈

| 层级 | 技术选型 |
|------|---------|
| 语言 | Python 3.8+ |
| 异步框架 | asyncio / aiohttp |
| 浏览器自动化 | CDP (Chrome DevTools Protocol) |
| HTTP 客户端 | httpx / aiohttp |
| 数据库 | MySQL / MongoDB / SQLite |
| 配置文件 | YAML / TOML |
| 日志 | logging |
