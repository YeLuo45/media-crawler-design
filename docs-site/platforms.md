# 7 大平台实现文档

MediaCrawler 支持小红书、抖音、快手、B站、微博、百度贴吧、知乎 7 大主流自媒体平台的爬取。本文档详细介绍各平台的实现细节、API 特性、数据结构和反爬策略。

## 平台概览

| 平台 | 特点 | 主要数据类型 | 认证方式 |
|------|------|-------------|----------|
| 小红书 | 生活方式分享社区 | 笔记、评论、用户信息 | Cookie |
| 抖音 | 短视频平台 | 视频、评论、用户信息 | Cookie |
| 快手 | 短视频平台 | 视频、评论、用户信息 | Cookie |
| B站 | 视频弹幕社区 | 视频、弹幕、评论、用户信息 | Cookie |
| 微博 | 社交媒体平台 | 微博、评论、用户信息 | Cookie |
| 百度贴吧 | 社区论坛平台 | 帖子、回复、用户信息 | Cookie |
| 知乎 | 问答知识社区 | 文章、回答、评论、用户信息 | Cookie |

## 架构设计

### 平台抽象层

所有平台实现遵循统一的抽象接口，通过工厂模式进行管理：

```python
# core/platform/base.py
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

class PlatformType(Enum):
    XIAOHONGSHU = "xiaohongshu"
    DOUYIN = "douyin"
    KUAISHOU = "kuaishou"
    BILIBILI = "bilibili"
    WEIBO = "weibo"
    BAIDU_TIEBA = "baidu_tieba"
    ZHIHU = "zhihu"

@dataclass
class MediaItem:
    """媒体内容数据模型"""
    platform: PlatformType
    item_id: str
    content: str
    author: Dict[str, Any]
    create_time: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None
    media_url: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    extra_data: Optional[Dict[str, Any]] = None

@dataclass
class CommentItem:
    """评论数据模型"""
    platform: PlatformType
    comment_id: str
    content: str
    author: Dict[str, Any]
    create_time: Optional[str] = None
    like_count: int = 0
    reply_count: int = 0
    parent_id: Optional[str] = None

class BasePlatform(ABC):
    """平台抽象基类"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.platform_type: PlatformType = None
        self.client: Optional[AsyncClient] = None
    
    @abstractmethod
    async def search(self, keyword: str, search_type: str = "content", **kwargs) -> List[MediaItem]:
        """搜索内容"""
        pass
    
    @abstractmethod
    async def get_user_posts(self, user_id: str, **kwargs) -> List[MediaItem]:
        """获取用户发布的内容"""
        pass
    
    @abstractmethod
    async def get_comments(self, item_id: str, **kwargs) -> List[CommentItem]:
        """获取内容评论"""
        pass
    
    @abstractmethod
    async def get_user_info(self, user_id: str) -> Dict[str, Any]:
        """获取用户信息"""
        pass
```

### 平台工厂模式

```python
# core/platform/factory.py
from typing import Dict, Type
from core.platform.base import BasePlatform, PlatformType

class PlatformFactory:
    """平台工厂类"""
    
    _platforms: Dict[PlatformType, Type[BasePlatform]] = {}
    
    @classmethod
    def register(cls, platform_type: PlatformType):
        """装饰器注册平台实现"""
        def decorator(platform_class: Type[BasePlatform]):
            cls._platforms[platform_type] = platform_class
            return platform_class
        return decorator
    
    @classmethod
    def create(cls, platform_type: PlatformType, config: Dict[str, Any]) -> BasePlatform:
        """创建平台实例"""
        if platform_type not in cls._platforms:
            raise ValueError(f"Unsupported platform: {platform_type}")
        return cls._platforms[platform_type](config)
    
    @classmethod
    def get_supported_platforms(cls) -> list[PlatformType]:
        """获取支持的所有平台"""
        return list(cls._platforms.keys())
```

## 小红书实现

### 平台特性

- **笔记内容**：支持图文笔记和视频笔记
- **搜索功能**：支持关键词搜索和用户搜索
- **评论嵌套**：支持二级评论嵌套结构

### API 特性分析

```python
# platforms/xiaohongshu/client.py
import httpx
from typing import Dict, Any, Optional

class XiaoHongShuClient:
    """小红书 API 客户端"""
    
    BASE_URL = "https://edith.xiaohongshu.com"
    
    def __init__(self, cookies: Dict[str, str]):
        self.cookies = cookies
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.xiaohongshu.com/",
            "X-s": self._generate_signature(),  # 请求签名
            "X-t": str(int(time.time() * 1000)),  # 时间戳
        }
    
    async def search_note(self, keyword: str, page: int = 1) -> Dict[str, Any]:
        """搜索笔记"""
        url = f"{self.BASE_URL}/api/sns/web/v1/search/notes"
        data = {
            "keyword": keyword,
            "page": page,
            "page_size": 20,
            "search_id": self._generate_search_id(),
            "sort": "general",
            "note_type": 0,
        }
        return await self._post(url, data)
    
    async def get_note_detail(self, note_id: str) -> Dict[str, Any]:
        """获取笔记详情"""
        url = f"{self.BASE_URL}/api/sns/web/v1/feed"
        data = {
            "source_note_id": note_id,
            "image_formats": ["jpg", "webp", "avif"],
        }
        return await self._post(url, data)
```

### 数据结构

```python
# platforms/xiaohongshu/models.py
from dataclasses import dataclass
from typing import List, Optional
from core.platform.base import MediaItem, CommentItem, PlatformType

@dataclass
class XiaoHongShuNote(MediaItem):
    """小红书笔记"""
    platform: PlatformType = PlatformType.XIAOHONGSHU
    note_type: int = 0  # 0图文 1视频
    images: List[str] = None
    video_url: Optional[str] = None
    collected_count: int = 0
    shared_count: int = 0

@dataclass
class XiaoHongShuComment(CommentItem):
    """小红书评论"""
    platform: PlatformType = PlatformType.XIAOHONGSHU
    ip_location: Optional[str] = None
    sub_comment_count: int = 0
```

### 反爬策略

- **X-s 签名**：请求需要携带基于设备信息和时间戳生成的签名
- **Cookie 验证**：需要有效的登录 Cookie
- **请求频率限制**：单 IP 每秒请求数限制
- **TLS 指纹**：需要模拟真实客户端的 TLS 指纹

## 抖音实现

### 平台特性

- **短视频内容**：主要爬取短视频内容
- **评论分页**：支持评论分页加载
- **用户数据**：支持获取用户基本信息和作品列表

### API 特性分析

```python
# platforms/douyin/client.py
class DouYinClient:
    """抖音 API 客户端"""
    
    BASE_URL = "https://www.douyin.com"
    
    async def search_aweme(self, keyword: str, offset: int = 0) -> Dict[str, Any]:
        """搜索视频"""
        url = f"{self.BASE_URL}/aweme/v1/web/general/search/single/"
        params = {
            "keyword": keyword,
            "offset": offset,
            "count": 20,
            "search_source": "normal_search",
        }
        return await self._get(url, params)
    
    async def get_user_aweme(self, sec_uid: str, offset: int = 0) -> Dict[str, Any]:
        """获取用户视频列表"""
        url = f"{self.BASE_URL}/aweme/v1/web/aweme/post/"
        params = {
            "sec_user_id": sec_uid,
            "offset": offset,
            "max_cursor": offset,
            "count": 20,
        }
        return await self._get(url, params)
    
    async def get_aweme_comment(self, aweme_id: str, cursor: int = 0) -> Dict[str, Any]:
        """获取视频评论"""
        url = f"{self.BASE_URL}/aweme/v1/web/comment/list/"
        params = {
            "aweme_id": aweme_id,
            "cursor": cursor,
            "count": 20,
        }
        return await self._get(url, params)
```

### 数据结构

```python
# platforms/douyin/models.py
from dataclasses import dataclass
from typing import Optional
from core.platform.base import MediaItem, CommentItem, PlatformType

@dataclass
class DouYinAweme(MediaItem):
    """抖音视频"""
    platform: PlatformType = PlatformType.DOUYIN
    video_url: str = None
    cover_url: str = None
    duration: int = 0  # 视频时长（秒）
    music_title: Optional[str] = None
    music_author: Optional[str] = None

@dataclass
class DouYinComment(CommentItem):
    """抖音评论"""
    platform: PlatformType = PlatformType.DOUYIN
    ip_location: Optional[str] = None
    reply_to_comment_id: Optional[str] = None
```

### 反爬策略

- **msToken**：请求需要携带 msToken
- **X-Bogus**：请求参数签名
- **ttwid**：访问令牌
- **代理 IP**：高频率请求需要使用代理 IP

## 快手实现

### 平台特性

- **短视频内容**：支持视频和图片内容
- **用户关系**：支持关注、粉丝数据
- **直播数据**：支持获取直播间信息

### API 特性分析

```python
# platforms/kuaishou/client.py
class KuaiShouClient:
    """快手 API 客户端"""
    
    BASE_URL = "https://www.kuaishou.com"
    
    async def search_feed(self, keyword: str, cursor: str = None) -> Dict[str, Any]:
        """搜索视频"""
        url = f"{self.BASE_URL}/graphql"
        data = {
            "operationName": "visionSearchPhoto",
            "variables": {
                "keyword": keyword,
                "cursor": cursor,
            },
            "query": """
                query visionSearchPhoto($keyword: String, $cursor: String) {
                    visionSearchPhoto(keyword: $keyword, cursor: $cursor) {
                        items { ... }
                        cursor
                    }
                }
            """,
        }
        return await self._post(url, data)
    
    async def get_user_profile(self, user_id: str) -> Dict[str, Any]:
        """获取用户信息"""
        url = f"{self.BASE_URL}/graphql"
        data = {
            "operationName": "visionProfilePhotoList",
            "variables": {"userId": user_id},
            "query": "query visionProfilePhotoList($userId: String) { ... }",
        }
        return await self._post(url, data)
```

### 数据结构

```python
# platforms/kuaishou/models.py
from dataclasses import dataclass
from typing import Optional
from core.platform.base import MediaItem, CommentItem, PlatformType

@dataclass
class KuaiShouMedia(MediaItem):
    """快手媒体内容"""
    platform: PlatformType = PlatformType.KUAISHOU
    photo_url: str = None
    cover_url: str = None
    view_count: int = 0
    share_count: int = 0
```

## B站实现

### 平台特性

- **视频弹幕**：独有的弹幕数据
- **专栏文章**：支持图文专栏内容
- **用户关系**：支持关注、粉丝、好友关系
- **番剧数据**：支持番剧信息获取

### API 特性分析

```python
# platforms/bilibili/client.py
class BilibiliClient:
    """B站 API 客户端"""
    
    BASE_URL = "https://api.bilibili.com"
    
    async def search_items(self, keyword: str, page: int = 1) -> Dict[str, Any]:
        """搜索内容"""
        url = f"{self.BASE_URL}/x/web-interface/search/type"
        params = {
            "search_type": "video",
            "keyword": keyword,
            "page": page,
        }
        return await self._get(url, params)
    
    async def get_video_info(self, bvid: str) -> Dict[str, Any]:
        """获取视频信息"""
        url = f"{self.BASE_URL}/x/web-interface/view"
        params = {"bvid": bvid}
        return await self._get(url, params)
    
    async def get_video_danmu(self, bvid: str) -> str:
        """获取视频弹幕（XML 格式）"""
        # 需要先获取 aid
        info = await self.get_video_info(bvid)
        aid = info["data"]["aid"]
        url = f"{self.BASE_URL}/x/v1/dm/list.so"
        params = {"oid": aid}
        return await self._get(url, params)
    
    async def get_comments(self, oid: str, type_: int = 1) -> Dict[str, Any]:
        """获取评论"""
        url = f"{self.BASE_URL}/x/v2/reply"
        params = {
            "type": type_,  # 1视频 11专栏
            "oid": oid,
            "pn": 1,
            "ps": 20,
        }
        return await self._get(url, params)
```

### 数据结构

```python
# platforms/bilibili/models.py
from dataclasses import dataclass
from typing import List, Optional
from core.platform.base import MediaItem, CommentItem, PlatformType

@dataclass
class BilibiliVideo(MediaItem):
    """B站视频"""
    platform: PlatformType = PlatformType.BILIBILI
    bvid: str = None
    aid: int = 0
    videos: int = 1  # 分P数
    pic: str = None  # 封面
    duration: int = 0
    dimension: Dict[str, int] = None
    owner_mid: int = 0
    dynamic: str = None  # 动态信息

@dataclass
class BilibiliDanmaku:
    """弹幕数据"""
    Danmaku_id: int
    Danmaku_content: str
    Danmaku_create_time: str
    Danmaku_mode: int  # 1-9 弹幕模式
    Danmaku_color: str  # 弹幕颜色
    Danmaku_pool: int
    Danmaku_dbid: int
    Danmaku_proid: int
    Danmaku_str_pid: int
    Danmaku_weight: int
    Danmaku_action: str
    Danmaku_pool_old: int
```

## 微博实现

### 平台特性

- **微博内容**：支持文字、图片、视频、话题
- **评论互动**：支持评论、点赞、转发
- **用户数据**：支持用户信息和粉丝列表
- **搜索功能**：支持关键词和用户搜索

### API 特性分析

```python
# platforms/weibo/client.py
class WeiBoClient:
    """微博 API 客户端"""
    
    BASE_URL = "https://m.weibo.cn"
    
    async def search(self, keyword: str, page: int = 1) -> Dict[str, Any]:
        """搜索微博"""
        url = f"{self.BASE_URL}/api/container/getIndex"
        params = {
            "type": "all",
            "queryVal": keyword,
            "page": page,
            "feature": 0,
        }
        return await self._get(url, params)
    
    async def get_status_detail(self, id_: str) -> Dict[str, Any]:
        """获取微博详情"""
        url = f"{self.BASE_URL}/api/container/getDetail"
        params = {"id": id_}
        return await self._get(url, params)
    
    async def get_comments(self, id_: str, max_id: str = None) -> Dict[str, Any]:
        """获取评论"""
        url = f"{self.BASE_URL}/api/comments/show"
        params = {
            "id": id_,
            "max_id": max_id or 0,
            "max_id_type": 0,
        }
        return await self._get(url, params)
```

### 数据结构

```python
# platforms/weibo/models.py
from dataclasses import dataclass
from typing import Optional
from core.platform.base import MediaItem, CommentItem, PlatformType

@dataclass
class WeiBoStatus(MediaItem):
    """微博内容"""
    platform: PlatformType = PlatformType.WEIBO
    mid: str = None  # 微博ID
    reposts_count: int = 0
    attitudes_count: int = 0
    comments_count: int = 0
    pic_urls: list = None
    retweeted_status: Optional["WeiBoStatus"] = None  # 转发原微博
```

## 百度贴吧实现

### 平台特性

- **帖子内容**：支持标题、正文、图片
- **楼中楼**：支持多层级回复结构
- **用户数据**：支持用户信息和发帖记录

### API 特性分析

```python
# platforms/baidu_tieba/client.py
class BaiduTiebaClient:
    """百度贴吧 API 客户端"""
    
    BASE_URL = "https://tieba.baidu.com"
    
    async def search_forum(self, keyword: str) -> Dict[str, Any]:
        """搜索贴吧"""
        url = f"{self.BASE_URL}/f/search/res"
        params = {
            "qw": keyword,
            "sm": 1,
            "only_thread": 0,
        }
        return await self._get(url, params)
    
    async def get_forum_posts(self, forum_name: str, pn: int = 1) -> Dict[str, Any]:
        """获取贴吧帖子列表"""
        url = f"{self.BASE_URL}/fForum/getForumBoard"
        params = {
            "fn": forum_name,
            "pn": pn,
            "rn": 30,
        }
        return await self._get(url, params)
    
    async def get_thread_detail(self, thread_id: str) -> Dict[str, Any]:
        """获取帖子详情"""
        url = f"{self.BASE_URL}/f/commit/thread/getThreadShare"
        params = {"tid": thread_id}
        return await self._get(url, params)
```

### 数据结构

```python
# platforms/baidu_tieba/models.py
from dataclasses import dataclass
from typing import List
from core.platform.base import MediaItem, CommentItem, PlatformType

@dataclass
class TiebaThread(MediaItem):
    """贴吧帖子"""
    platform: PlatformType = PlatformType.BAIDU_TIEBA
    forum_name: str = None  # 贴吧名称
    thread_id: str = None
    is_good: bool = False  # 精品帖
    is_top: bool = False  # 置顶帖
    reply_num: int = 0
    see_lz_num: int = 0  # 看楼主数

@dataclass
class TiebaPost(CommentItem):
    """贴吧回复"""
    platform: PlatformType = PlatformType.BAIDU_TIEBA
    thread_id: str = None
    floor: int = 0  # 楼层号
    sub_post_number: int = 0  # 楼中楼回复数
```

## 知乎实现

### 平台特性

- **问答内容**：支持问答和文章
- **评论系统**：支持评论和回复
- **专栏文章**：支持知乎专栏内容
- **用户数据**：支持用户信息和回答列表

### API 特性分析

```python
# platforms/zhihu/client.py
class ZhiHuClient:
    """知乎 API 客户端"""
    
    BASE_URL = "https://www.zhihu.com"
    
    async def search(self, keyword: str, offset: int = 0) -> Dict[str, Any]:
        """搜索内容"""
        url = f"{self.BASE_URL}/api/v4/search_v3"
        params = {
            "t": "general",
            "q": keyword,
            "offset": offset,
            "limit": 20,
        }
        return await self._get(url, params)
    
    async def get_answer(self, answer_id: str) -> Dict[str, Any]:
        """获取回答详情"""
        url = f"{self.BASE_URL}/api/v4/answers/{answer_id}"
        return await self._get(url)
    
    async def get_article(self, article_id: str) -> Dict[str, Any]:
        """获取文章详情"""
        url = f"{self.BASE_URL}/api/v4/articles/{article_id}"
        return await self._get(url)
    
    async def get_comments(self, subject_id: str, type_: str = "answer") -> Dict[str, Any]:
        """获取评论"""
        url = f"{self.BASE_URL}/api/v4/comments/{type_}s/{subject_id}/root_comments"
        params = {
            "limit": 20,
            "offset": 0,
            "order": "reverse",
        }
        return await self._get(url, params)
```

### 数据结构

```python
# platforms/zhihu/models.py
from dataclasses import dataclass
from typing import Optional
from core.platform.base import MediaItem, CommentItem, PlatformType

@dataclass
class ZhiHuAnswer(MediaItem):
    """知乎回答"""
    platform: PlatformType = PlatformType.ZHIHU
    question_id: str = None
    question_title: str = None
    answer_id: str = None
    voteup_count: int = 0
    commenting_count: int = 0
    excercise_id: Optional[int] = None

@dataclass
class ZhiHuArticle(MediaItem):
    """知乎文章"""
    platform: PlatformType = PlatformType.ZHIHU
    article_id: str = None
    title: str = None
    voteup_count: int = 0
    commenting_count: int = 0
    cover_url: Optional[str] = None
```

## 统一接口实现

```python
# core/platform/manager.py
from typing import List, Optional, Dict, Any
from core.platform.base import (
    BasePlatform, PlatformType, MediaItem, CommentItem
)
from core.platform.factory import PlatformFactory

class PlatformManager:
    """平台统一管理器"""
    
    def __init__(self, config: Dict[str, Any]):
        self.platforms: Dict[PlatformType, BasePlatform] = {}
        self._init_platforms(config)
    
    def _init_platforms(self, config: Dict[str, Any]):
        """初始化所有平台"""
        for platform_type in PlatformType:
            try:
                platform = PlatformFactory.create(platform_type, config)
                self.platforms[platform_type] = platform
            except ValueError:
                continue  # 不支持的平台跳过
    
    async def search_all(
        self, 
        keyword: str, 
        platforms: Optional[List[PlatformType]] = None
    ) -> Dict[PlatformType, List[MediaItem]]:
        """在所有/指定平台搜索"""
        if platforms is None:
            platforms = list(self.platforms.keys())
        
        results = {}
        async with asyncio.TaskGroup() as tg:
            for platform_type in platforms:
                if platform_type in self.platforms:
                    task = tg.create_task(
                        self.platforms[platform_type].search(keyword)
                    )
                    results[platform_type] = task
        
        return results
    
    async def get_user_posts_all(
        self,
        user_id: str,
        platforms: Optional[List[PlatformType]] = None
    ) -> Dict[PlatformType, List[MediaItem]]:
        """获取用户在所有/指定平台的内容"""
        if platforms is None:
            platforms = list(self.platforms.keys())
        
        results = {}
        async with asyncio.TaskGroup() as tg:
            for platform_type in platforms:
                if platform_type in self.platforms:
                    task = tg.create_task(
                        self.platforms[platform_type].get_user_posts(user_id)
                    )
                    results[platform_type] = task
        
        return results
```

## 平台扩展指南

### 添加新平台

1. **创建平台目录**：`platforms/new_platform/`
2. **实现客户端**：`new_platform/client.py`
3. **定义数据模型**：`new_platform/models.py`
4. **实现平台类**：`new_platform/platform.py`
5. **注册到工厂**：

```python
from core.platform.factory import PlatformFactory
from core.platform.base import PlatformType

@PlatformFactory.register(PlatformType.NEW_PLATFORM)
class NewPlatform(BasePlatform):
    # 实现抽象方法
    pass
```

### 注意事项

- 确保 Cookie 有效性，定期更新
- 实现合理的请求间隔，避免封禁
- 处理好登录态和验证码
- 遵守各平台 robots.txt 和使用条款
