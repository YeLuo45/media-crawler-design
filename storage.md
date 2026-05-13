# 数据存储架构

> MediaCrawler 多平台自媒体爬虫框架存储层设计文档

## 1. 存储架构概览

MediaCrawler 支持 7 种存储后端，采用统一抽象接口设计，支持灵活切换和数据迁移。

| 存储类型 | 适用场景 | 配置复杂度 | 数据量级 |
|---------|---------|-----------|---------|
| CSV/JSON/JSONL | 小规模、临时数据、调试 | ★☆☆☆☆ | < 10万 |
| SQLite | 单机中小规模、便携性 | ★★☆☆☆ | < 100万 |
| MySQL | 生产环境、分布式 | ★★★☆☆ | 千万级 |
| MongoDB | 非结构化数据、文档存储 | ★★★☆☆ | 千万级 |
| Excel | 运营报表、数据分析 | ★☆☆☆☆ | < 10万 |

## 2. 存储抽象层设计

### 2.1 抽象基类

所有存储后端实现继承自统一的抽象基类：

```python
# core/storage/base.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class StorageConfig:
    """存储配置"""
    storage_type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    file_path: Optional[str] = None  # 文件存储路径

class BaseStorage(ABC):
    """存储抽象基类"""

    def __init__(self, config: StorageConfig):
        self.config = config

    @abstractmethod
    async def initialize(self) -> None:
        """初始化存储连接"""
        pass

    @abstractmethod
    async def save_posts(self, posts: List[Dict[str, Any]]) -> int:
        """保存帖子数据，返回保存数量"""
        pass

    @abstractmethod
    async def save_users(self, users: List[Dict[str, Any]]) -> int:
        """保存用户数据，返回保存数量"""
        pass

    @abstractmethod
    async def save_comments(self, comments: List[Dict[str, Any]]) -> int:
        """保存评论数据，返回保存数量"""
        pass

    @abstractmethod
    async def save_medias(self, medias: List[Dict[str, Any]]) -> int:
        """保存媒体数据（视频/图片），返回保存数量"""
        pass

    @abstractmethod
    async def query_posts(self, conditions: Dict[str, Any]) -> List[Dict[str, Any]]:
        """查询帖子数据"""
        pass

    @abstractmethod
    async def close(self) -> None:
        """关闭存储连接"""
        pass
```

### 2.2 存储工厂模式

```python
# core/storage/factory.py
from typing import Dict, Type
from core.storage.base import BaseStorage, StorageConfig

class StorageFactory:
    """存储工厂类"""

    _storages: Dict[str, Type[BaseStorage]] = {}

    @classmethod
    def register(cls, name: str, storage_class: Type[BaseStorage]):
        """注册存储后端"""
        cls._storages[name] = storage_class

    @classmethod
    def create(cls, config: StorageConfig) -> BaseStorage:
        """创建存储实例"""
        storage_type = config.storage_type.lower()
        if storage_type not in cls._storages:
            raise ValueError(f"Unsupported storage type: {storage_type}")
        return cls._storages[storage_type](config)

# 自动注册内置存储后端
StorageFactory.register("csv", CSVStorage)
StorageFactory.register("json", JSONStorage)
StorageFactory.register("jsonl", JSONLStorage)
StorageFactory.register("sqlite", SQLiteStorage)
StorageFactory.register("mysql", MySQLStorage)
StorageFactory.register("mongodb", MongoDBStorage)
StorageFactory.register("excel", ExcelStorage)
```

## 3. 关系型数据库存储

### 3.1 MySQL 存储实现

```python
# core/storage/mysql_storage.py
import aiomysql
from typing import List, Dict, Any
from core.storage.base import BaseStorage, StorageConfig

class MySQLStorage(BaseStorage):
    """MySQL 存储后端"""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.pool: aiomysql.Pool = None

    async def initialize(self) -> None:
        """创建连接池"""
        self.pool = await aiomysql.create_pool(
            host=self.config.host,
            port=self.config.port or 3306,
            user=self.config.username,
            password=self.config.password,
            db=self.config.database,
            autocommit=True,
            minsize=5,
            maxsize=20,
        )
        await self._create_tables()

    async def _create_tables(self) -> None:
        """创建数据表"""
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                # 帖子表
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS posts (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        post_id VARCHAR(64) NOT NULL UNIQUE,
                        platform VARCHAR(32) NOT NULL,
                        title VARCHAR(512),
                        content TEXT,
                        author_id VARCHAR(64),
                        author_name VARCHAR(128),
                        publish_time DATETIME,
                        like_count INT DEFAULT 0,
                        comment_count INT DEFAULT 0,
                        share_count INT DEFAULT 0,
                        collect_count INT DEFAULT 0,
                        tags TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_platform (platform),
                        INDEX idx_author (author_id),
                        INDEX idx_publish_time (publish_time),
                        FULLTEXT INDEX idx_content (content)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)

                # 用户表
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        user_id VARCHAR(64) NOT NULL UNIQUE,
                        platform VARCHAR(32) NOT NULL,
                        nickname VARCHAR(128),
                        avatar VARCHAR(512),
                        followers_count INT DEFAULT 0,
                        following_count INT DEFAULT 0,
                        post_count INT DEFAULT 0,
                        verified BOOLEAN DEFAULT FALSE,
                        verified_type VARCHAR(32),
                        description TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_platform (platform),
                        INDEX idx_nickname (nickname)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)

                # 评论表
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS comments (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        comment_id VARCHAR(64) NOT NULL UNIQUE,
                        post_id VARCHAR(64) NOT NULL,
                        platform VARCHAR(32) NOT NULL,
                        user_id VARCHAR(64),
                        user_name VARCHAR(128),
                        content TEXT,
                        like_count INT DEFAULT 0,
                        reply_count INT DEFAULT 0,
                        ip_location VARCHAR(64),
                        parent_id VARCHAR(64),
                        created_at DATETIME,
                        INDEX idx_post (post_id),
                        INDEX idx_platform (platform),
                        INDEX idx_user (user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)

    async def save_posts(self, posts: List[Dict[str, Any]]) -> int:
        """批量保存帖子"""
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                sql = """
                    INSERT INTO posts (
                        post_id, platform, title, content, author_id, author_name,
                        publish_time, like_count, comment_count, share_count,
                        collect_count, tags
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    ) ON DUPLICATE KEY UPDATE
                        title = VALUES(title),
                        content = VALUES(content),
                        like_count = VALUES(like_count),
                        comment_count = VALUES(comment_count),
                        share_count = VALUES(share_count)
                """
                values = [
                    (
                        p.get("post_id"), p.get("platform"), p.get("title"),
                        p.get("content"), p.get("author_id"), p.get("author_name"),
                        p.get("publish_time"), p.get("like_count", 0),
                        p.get("comment_count", 0), p.get("share_count", 0),
                        p.get("collect_count", 0), ",".join(p.get("tags", []))
                    )
                    for p in posts
                ]
                await cursor.executemany(sql, values)
                return len(values)

    async def save_users(self, users: List[Dict[str, Any]]) -> int:
        """批量保存用户"""
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                sql = """
                    INSERT INTO users (
                        user_id, platform, nickname, avatar, followers_count,
                        following_count, post_count, verified, verified_type, description
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    ) ON DUPLICATE KEY UPDATE
                        nickname = VALUES(nickname),
                        avatar = VALUES(avatar),
                        followers_count = VALUES(followers_count),
                        post_count = VALUES(post_count)
                """
                values = [
                    (
                        u.get("user_id"), u.get("platform"), u.get("nickname"),
                        u.get("avatar"), u.get("followers_count", 0),
                        u.get("following_count", 0), u.get("post_count", 0),
                        u.get("verified", False), u.get("verified_type"),
                        u.get("description")
                    )
                    for u in users
                ]
                await cursor.executemany(sql, values)
                return len(values)

    async def save_comments(self, comments: List[Dict[str, Any]]) -> int:
        """批量保存评论"""
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                sql = """
                    INSERT INTO comments (
                        comment_id, post_id, platform, user_id, user_name,
                        content, like_count, reply_count, ip_location, parent_id, created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    ) ON DUPLICATE KEY UPDATE
                        like_count = VALUES(like_count),
                        reply_count = VALUES(reply_count)
                """
                values = [
                    (
                        c.get("comment_id"), c.get("post_id"), c.get("platform"),
                        c.get("user_id"), c.get("user_name"), c.get("content"),
                        c.get("like_count", 0), c.get("reply_count", 0),
                        c.get("ip_location"), c.get("parent_id"), c.get("created_at")
                    )
                    for c in comments
                ]
                await cursor.executemany(sql, values)
                return len(values)

    async def save_medias(self, medias: List[Dict[str, Any]]) -> int:
        """保存媒体数据"""
        # 媒体数据通常存储为文件路径，此处记录元数据
        pass

    async def query_posts(self, conditions: Dict[str, Any]) -> List[Dict[str, Any]]:
        """查询帖子"""
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                where_clauses = []
                params = []
                if "platform" in conditions:
                    where_clauses.append("platform = %s")
                    params.append(conditions["platform"])
                if "author_id" in conditions:
                    where_clauses.append("author_id = %s")
                    params.append(conditions["author_id"])
                if "keyword" in conditions:
                    where_clauses.append("MATCH(content) AGAINST(%s IN BOOLEAN MODE)")
                    params.append(conditions["keyword"])

                sql = "SELECT * FROM posts"
                if where_clauses:
                    sql += " WHERE " + " AND ".join(where_clauses)
                sql += " ORDER BY publish_time DESC LIMIT 100"

                await cursor.execute(sql, params)
                return await cursor.fetchall()

    async def close(self) -> None:
        """关闭连接池"""
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
```

### 3.2 SQLite 存储实现

```python
# core/storage/sqlite_storage.py
import aiosqlite
from typing import List, Dict, Any
from core.storage.base import BaseStorage, StorageConfig

class SQLiteStorage(BaseStorage):
    """SQLite 存储后端"""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.db_path = config.file_path or "media_crawler.db"
        self.conn: aiosqlite.Connection = None

    async def initialize(self) -> None:
        """初始化数据库连接"""
        self.conn = await aiosqlite.connect(self.db_path)
        self.conn.row_factory = aiosqlite.Row
        await self._create_tables()

    async def _create_tables(self) -> None:
        """创建数据表"""
        await self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id TEXT NOT NULL UNIQUE,
                platform TEXT NOT NULL,
                title TEXT,
                content TEXT,
                author_id TEXT,
                author_name TEXT,
                publish_time TEXT,
                like_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                share_count INTEGER DEFAULT 0,
                collect_count INTEGER DEFAULT 0,
                tags TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                platform TEXT NOT NULL,
                nickname TEXT,
                avatar TEXT,
                followers_count INTEGER DEFAULT 0,
                following_count INTEGER DEFAULT 0,
                post_count INTEGER DEFAULT 0,
                verified INTEGER DEFAULT 0,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                comment_id TEXT NOT NULL UNIQUE,
                post_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                user_id TEXT,
                user_name TEXT,
                content TEXT,
                like_count INTEGER DEFAULT 0,
                reply_count INTEGER DEFAULT 0,
                ip_location TEXT,
                parent_id TEXT,
                created_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
            CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
            CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
        """)
        await self.conn.commit()

    async def save_posts(self, posts: List[Dict[str, Any]]) -> int:
        """批量保存帖子"""
        await self.conn.executemany("""
            INSERT OR REPLACE INTO posts (
                post_id, platform, title, content, author_id, author_name,
                publish_time, like_count, comment_count, share_count, collect_count, tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (
                p.get("post_id"), p.get("platform"), p.get("title"),
                p.get("content"), p.get("author_id"), p.get("author_name"),
                p.get("publish_time"), p.get("like_count", 0),
                p.get("comment_count", 0), p.get("share_count", 0),
                p.get("collect_count", 0), ",".join(p.get("tags", []))
            )
            for p in posts
        ])
        await self.conn.commit()
        return len(posts)

    async def save_users(self, users: List[Dict[str, Any]]) -> int:
        """批量保存用户"""
        await self.conn.executemany("""
            INSERT OR REPLACE INTO users (
                user_id, platform, nickname, avatar, followers_count,
                following_count, post_count, verified, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (
                u.get("user_id"), u.get("platform"), u.get("nickname"),
                u.get("avatar"), u.get("followers_count", 0),
                u.get("following_count", 0), u.get("post_count", 0),
                int(u.get("verified", False)), u.get("description")
            )
            for u in users
        ])
        await self.conn.commit()
        return len(users)

    async def save_comments(self, comments: List[Dict[str, Any]]) -> int:
        """批量保存评论"""
        await self.conn.executemany("""
            INSERT OR REPLACE INTO comments (
                comment_id, post_id, platform, user_id, user_name,
                content, like_count, reply_count, ip_location, parent_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (
                c.get("comment_id"), c.get("post_id"), c.get("platform"),
                c.get("user_id"), c.get("user_name"), c.get("content"),
                c.get("like_count", 0), c.get("reply_count", 0),
                c.get("ip_location"), c.get("parent_id"), c.get("created_at")
            )
            for c in comments
        ])
        await self.conn.commit()
        return len(comments)

    async def save_medias(self, medias: List[Dict[str, Any]]) -> int:
        pass

    async def query_posts(self, conditions: Dict[str, Any]) -> List[Dict[str, Any]]:
        """查询帖子"""
        where_clauses = []
        params = []
        if "platform" in conditions:
            where_clauses.append("platform = ?")
            params.append(conditions["platform"])

        sql = "SELECT * FROM posts"
        if where_clauses:
            sql += " WHERE " + " AND ".join(where_clauses)
        sql += " ORDER BY publish_time DESC LIMIT 100"

        cursor = await self.conn.execute(sql, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def close(self) -> None:
        """关闭连接"""
        if self.conn:
            await self.conn.close()
```

## 4. 文件存储

### 4.1 JSONL 存储实现

```python
# core/storage/jsonl_storage.py
import aiofiles
import json
from typing import List, Dict, Any
from pathlib import Path
from core.storage.base import BaseStorage, StorageConfig

class JSONLStorage(BaseStorage):
    """JSONL (JSON Lines) 文件存储后端"""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.base_path = Path(config.file_path or "./data")
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def initialize(self) -> None:
        """确保数据目录存在"""
        (self.base_path / "posts").mkdir(exist_ok=True)
        (self.base_path / "users").mkdir(exist_ok=True)
        (self.base_path / "comments").mkdir(exist_ok=True)

    async def _append_to_file(self, filepath: Path, data: Dict[str, Any]) -> None:
        """追加写入文件"""
        async with aiofiles.open(filepath, mode='a', encoding='utf-8') as f:
            await f.write(json.dumps(data, ensure_ascii=False) + '\n')

    async def save_posts(self, posts: List[Dict[str, Any]]) -> int:
        """保存帖子到文件"""
        filepath = self.base_path / "posts" / f"{posts[0].get('platform', 'unknown')}_posts.jsonl"
        for post in posts:
            await self._append_to_file(filepath, post)
        return len(posts)

    async def save_users(self, users: List[Dict[str, Any]]) -> int:
        """保存用户到文件"""
        filepath = self.base_path / "users" / f"{users[0].get('platform', 'unknown')}_users.jsonl"
        for user in users:
            await self._append_to_file(filepath, user)
        return len(users)

    async def save_comments(self, comments: List[Dict[str, Any]]) -> int:
        """保存评论到文件"""
        filepath = self.base_path / "comments" / f"{comments[0].get('platform', 'unknown')}_comments.jsonl"
        for comment in comments:
            await self._append_to_file(filepath, comment)
        return len(comments)

    async def save_medias(self, medias: List[Dict[str, Any]]) -> int:
        """保存媒体元数据到文件"""
        filepath = self.base_path / "medias.jsonl"
        for media in medias:
            await self._append_to_file(filepath, media)
        return len(medias)

    async def query_posts(self, conditions: Dict[str, Any]) -> List[Dict[str, Any]]:
        """查询帖子（内存加载）"""
        results = []
        filepath = self.base_path / "posts"
        if filepath.exists():
            for file in filepath.glob("*_posts.jsonl"):
                if "platform" in conditions and conditions["platform"] not in file.name:
                    continue
                async with aiofiles.open(file, 'r', encoding='utf-8') as f:
                    async for line in f:
                        post = json.loads(line)
                        if self._match_conditions(post, conditions):
                            results.append(post)
        return results[:100]

    def _match_conditions(self, data: Dict[str, Any], conditions: Dict[str, Any]) -> bool:
        """匹配查询条件"""
        for key, value in conditions.items():
            if key not in data or data[key] != value:
                return False
        return True

    async def close(self) -> None:
        """无需关闭操作"""
        pass
```

### 4.2 CSV 存储实现

```python
# core/storage/csv_storage.py
import aiofiles
import csv
from typing import List, Dict, Any
from pathlib import Path
from core.storage.base import BaseStorage, StorageConfig

class CSVStorage(BaseStorage):
    """CSV 文件存储后端"""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.base_path = Path(config.file_path or "./data")
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def initialize(self) -> None:
        pass

    def _get_filepath(self, data_type: str, platform: str) -> Path:
        """获取数据文件路径"""
        return self.base_path / f"{platform}_{data_type}.csv"

    def _flatten_dict(self, data: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
        """扁平化字典，用于 CSV 写入"""
        result = {}
        for key, value in data.items():
            new_key = f"{prefix}_{key}" if prefix else key
            if isinstance(value, dict):
                result.update(self._flatten_dict(value, new_key))
            elif isinstance(value, list):
                result[new_key] = ",".join(str(v) for v in value)
            else:
                result[new_key] = value
        return result

    async def _append_to_csv(self, filepath: Path, data: Dict[str, Any]) -> None:
        """追加写入 CSV"""
        flat_data = self._flatten_dict(data)
        file_exists = filepath.exists()

        async with aiofiles.open(filepath, mode='a', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=flat_data.keys())
            if not file_exists:
                await f.write(','.join(flat_data.keys()) + '\n')
            await f.write(','.join(str(v) for v in flat_data.values()) + '\n')

    async def save_posts(self, posts: List[Dict[str, Any]]) -> int:
        """保存帖子到 CSV"""
        if not posts:
            return 0
        platform = posts[0].get("platform", "unknown")
        filepath = self._get_filepath("posts", platform)
        for post in posts:
            await self._append_to_csv(filepath, post)
        return len(posts)

    async def save_users(self, users: List[Dict[str, Any]]) -> int:
        """保存用户到 CSV"""
        if not users:
            return 0
        platform = users[0].get("platform", "unknown")
        filepath = self._get_filepath("users", platform)
        for user in users:
            await self._append_to_csv(filepath, user)
        return len(users)

    async def save_comments(self, comments: List[Dict[str, Any]]) -> int:
        """保存评论到 CSV"""
        if not comments:
            return 0
        platform = comments[0].get("platform", "unknown")
        filepath = self._get_filepath("comments", platform)
        for comment in comments:
            await self._append_to_csv(filepath, comment)
        return len(comments)

    async def save_medias(self, medias: List[Dict[str, Any]]) -> int:
        pass

    async def query_posts(self, conditions: Dict[str, Any]) -> List[Dict[str, Any]]:
        results = []
        for file in self.base_path.glob("*_posts.csv"):
            async with aiofiles.open(file, 'r', encoding='utf-8') as f:
                content = await f.read()
                reader = csv.DictReader(content.strip().split('\n'))
                for row in reader:
                    if all(row.get(k) == str(v) for k, v in conditions.items()):
                        results.append(row)
        return results[:100]

    async def close(self) -> None:
        pass
```

## 5. MongoDB 存储

```python
# core/storage/mongodb_storage.py
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Dict, Any
from core.storage.base import BaseStorage, StorageConfig

class MongoDBStorage(BaseStorage):
    """MongoDB 存储后端"""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.client: AsyncIOMotorClient = None
        self.db = None

    async def initialize(self) -> None:
        """初始化 MongoDB 连接"""
        connection_string = f"mongodb://{self.config.host}:{self.config.port or 27017}"
        self.client = AsyncIOMotorClient(connection_string)
        self.db = self.client[self.config.database]

        # 创建索引
        await self.db.posts.create_index([("post_id", 1)], unique=True)
        await self.db.posts.create_index([("platform", 1)])
        await self.db.posts.create_index([("author_id", 1)])
        await self.db.users.create_index([("user_id", 1)], unique=True)
        await self.db.comments.create_index([("comment_id", 1)], unique=True)
        await self.db.comments.create_index([("post_id", 1)])

    async def save_posts(self, posts: List[Dict[str, Any]]) -> int:
        """批量保存帖子"""
        if not posts:
            return 0
        operations = [
            {"updateOne": {
                "filter": {"post_id": p["post_id"]},
                "update": {"$set": p},
                "upsert": True
            }}
            for p in posts
        ]
        result = await self.db.posts.bulk_write(operations)
        return result.upserted_count + result.modified_count

    async def save_users(self, users: List[Dict[str, Any]]) -> int:
        """批量保存用户"""
        if not users:
            return 0
        operations = [
            {"updateOne": {
                "filter": {"user_id": u["user_id"]},
                "update": {"$set": u},
                "upsert": True
            }}
            for u in users
        ]
        result = await self.db.users.bulk_write(operations)
        return result.upserted_count + result.modified_count

    async def save_comments(self, comments: List[Dict[str, Any]]) -> int:
        """批量保存评论"""
        if not comments:
            return 0
        operations = [
            {"updateOne": {
                "filter": {"comment_id": c["comment_id"]},
                "update": {"$set": c},
                "upsert": True
            }}
            for c in comments
        ]
        result = await self.db.comments.bulk_write(operations)
        return result.upserted_count + result.modified_count

    async def save_medias(self, medias: List[Dict[str, Any]]) -> int:
        """保存媒体元数据"""
        if not medias:
            return 0
        operations = [
            {"updateOne": {
                "filter": {"media_id": m.get("media_id")},
                "update": {"$set": m},
                "upsert": True
            }}
            for m in medias
        ]
        result = await self.db.medias.bulk_write(operations)
        return result.upserted_count + result.modified_count

    async def query_posts(self, conditions: Dict[str, Any]) -> List[Dict[str, Any]]:
        """查询帖子"""
        cursor = self.db.posts.find(conditions).sort("publish_time", -1).limit(100)
        return await cursor.to_list(length=100)

    async def close(self) -> None:
        """关闭连接"""
        if self.client:
            self.client.close()
```

## 6. 数据模型设计

### 6.1 核心数据模型

```
┌─────────────────────────────────────────────────────────────────────┐
│                         数据模型关系图                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐   │
│  │    Post     │         │    User     │         │   Comment   │   │
│  ├─────────────┤         ├─────────────┤         ├─────────────┤   │
│  │ post_id     │         │ user_id     │         │ comment_id  │   │
│  │ platform    │         │ platform    │         │ post_id     │   │
│  │ title       │         │ nickname    │         │ user_id     │   │
│  │ content     │         │ avatar      │         │ content     │   │
│  │ author_id   │────────▶│ description │◀────────│ parent_id   │   │
│  │ publish_time│         │ followers   │         │ created_at  │   │
│  │ stats       │         └─────────────┘         └─────────────┘   │
│  │ media_urls  │                                            │       │
│  └─────────────┘                                            │       │
│        │                                                    │       │
│        ▼                                                    ▼       │
│  ┌─────────────┐                                   ┌─────────────┐   │
│  │    Media    │                                   │  UserReply  │   │
│  ├─────────────┤                                   ├─────────────┤   │
│  │ media_id    │                                   │ comment_id  │   │
│  │ post_id     │                                   │ reply_id    │   │
│  │ type        │                                   │ content     │   │
│  │ url         │                                   │ user_id     │   │
│  │ local_path  │                                   └─────────────┘   │
│  │ status      │                                                   │
│  └─────────────┘                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 字段说明

| 实体 | 字段 | 类型 | 说明 |
|------|------|------|------|
| Post | post_id | string | 帖子唯一标识 |
| Post | platform | string | 平台名称 |
| Post | title | string | 标题 |
| Post | content | text | 正文内容 |
| Post | author_id | string | 作者ID |
| Post | author_name | string | 作者昵称 |
| Post | publish_time | datetime | 发布时间 |
| Post | like_count | int | 点赞数 |
| Post | comment_count | int | 评论数 |
| Post | share_count | int | 分享数 |
| Post | collect_count | int | 收藏数 |
| Post | tags | list | 标签列表 |
| User | user_id | string | 用户唯一标识 |
| User | platform | string | 平台名称 |
| User | nickname | string | 昵称 |
| User | avatar | string | 头像URL |
| User | followers_count | int | 粉丝数 |
| User | following_count | int | 关注数 |
| User | post_count | int | 发帖数 |
| User | verified | bool | 是否认证 |
| Comment | comment_id | string | 评论唯一标识 |
| Comment | post_id | string | 所属帖子ID |
| Comment | user_id | string | 评论者ID |
| Comment | content | text | 评论内容 |
| Comment | like_count | int | 点赞数 |
| Comment | parent_id | string | 父评论ID |

## 7. 媒体文件存储

### 7.1 媒体下载架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        媒体下载流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   PostData   │───▶│ MediaParser  │───▶│ MediaQueue   │          │
│  │              │    │              │    │              │          │
│  │ - post_id    │    │ - extract    │    │ - url        │          │
│  │ - media_urls │    │   media_urls │    │ - local_path │          │
│  └──────────────┘    └──────────────┘    └──────┬───────┘          │
│                                                  │                  │
│                                                  ▼                  │
│                   ┌──────────────┐    ┌──────────────┐              │
│                   │ Downloader   │◀───│ TaskQueue    │              │
│                   │              │    │              │              │
│                   │ - async dl   │    │ - priority   │              │
│                   │ - retry      │    │ - batch      │              │
│                   │ - checksum   │    └──────────────┘              │
│                   └──────┬───────┘                                   │
│                          │                                          │
│                          ▼                                          │
│                   ┌──────────────┐    ┌──────────────┐              │
│                   │ FileStorage  │───▶│ MetaStore    │              │
│                   │              │    │              │              │
│                   │ - local disk │    │ - db record  │              │
│                   │ - oss/s3     │    │ - status     │              │
│                   └──────────────┘    └──────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 媒体存储策略

| 存储方式 | 适用场景 | 优点 | 缺点 |
|---------|---------|------|------|
| 本地磁盘 | 小规模、个人使用 | 简单、成本低 | 不支持分布式 |
| OSS/COS | 生产环境 | 弹性扩展、CDN加速 | 需要云服务 |
| S3兼容 | 跨云部署 | 标准化、多云支持 | 配置复杂 |
| 混合存储 | 大规模爬虫 | 冷热分离、成本优化 | 架构复杂 |

## 8. 配置示例

### 8.1 YAML 配置

```yaml
# config/storage.yaml
storage:
  type: mysql  # 可选: csv, json, jsonl, sqlite, mysql, mongodb, excel

  # MySQL 配置
  mysql:
    host: localhost
    port: 3306
    database: media_crawler
    username: root
    password: password

  # MongoDB 配置
  mongodb:
    host: localhost
    port: 27017
    database: media_crawler

  # 文件存储配置
  file:
    path: ./data
    encoding: utf-8

  # 媒体存储配置
  media:
    storage_type: local  # local, oss, s3
    local_path: ./media
    oss:
      endpoint: oss-cn-beijing.aliyuncs.com
      bucket: media-crawler
      access_key: xxx
      secret_key: xxx
```

### 8.2 初始化代码

```python
# core/storage/__init__.py
from core.storage.base import BaseStorage, StorageConfig
from core.storage.factory import StorageFactory
from core.storage.csv_storage import CSVStorage
from core.storage.json_storage import JSONStorage
from core.storage.jsonl_storage import JSONLStorage
from core.storage.sqlite_storage import SQLiteStorage
from core.storage.mysql_storage import MySQLStorage
from core.storage.mongodb_storage import MongoDBStorage
from core.storage.excel_storage import ExcelStorage

__all__ = [
    "BaseStorage",
    "StorageConfig",
    "StorageFactory",
    "CSVStorage",
    "JSONStorage",
    "JSONLStorage",
    "SQLiteStorage",
    "MySQLStorage",
    "MongoDBStorage",
    "ExcelStorage",
]

# 使用示例
async def main():
    config = StorageConfig(
        storage_type="mysql",
        host="localhost",
        port=3306,
        database="media_crawler",
        username="root",
        password="password"
    )

    storage = StorageFactory.create(config)
    await storage.initialize()

    posts = [{"post_id": "1", "title": "test", ...}]
    await storage.save_posts(posts)

    await storage.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

## 9. 存储后端对比

| 特性 | MySQL | SQLite | MongoDB | JSONL | CSV |
|------|-------|--------|---------|-------|-----|
| 并发支持 | ★★★★★ | ★★☆☆☆ | ★★★★☆ | ★★★☆☆ | ★★★☆☆ |
| 数据量级 | 千万级 | 百万级 | 千万级 | 受限于磁盘 | 受限于内存 |
| 查询能力 | ★★★★★ | ★★★☆☆ | ★★★★☆ | ★★☆☆☆ | ★★☆☆☆ |
| 事务支持 | ✓ | ✓ | ✓ | ✗ | ✗ |
| 部署复杂度 | 高 | 低 | 中 | 低 | 低 |
| 备份恢复 | ★★★★★ | ★★★☆☆ | ★★★★☆ | ★★★☆☆ | ★★☆☆☆ |
| 适用场景 | 生产 | 开发/小规模 | 非结构化 | 日志/流式 | 报表 |

## 10. 数据迁移

### 10.1 迁移工具设计

```python
# core/storage/migrator.py
class StorageMigrator:
    """数据迁移工具"""

    def __init__(self, source: BaseStorage, target: BaseStorage):
        self.source = source
        self.target = target

    async def migrate_posts(self, batch_size: int = 1000):
        """迁移帖子数据"""
        offset = 0
        while True:
            posts = await self.source.query_posts({})
            if not posts:
                break

            await self.target.save_posts(posts)
            offset += len(posts)

            if len(posts) < batch_size:
                break

    async def migrate_all(self):
        """迁移所有数据"""
        await self.migrate_posts()
        await self.migrate_users()
        await self.migrate_comments()
```

## 11. 最佳实践

1. **开发调试**：使用 SQLite 或 JSONL，简单易用
2. **小规模爬虫**：SQLite 足够，支持 SQL 查询
3. **生产环境**：MySQL + MongoDB 组合使用
4. **数据安全**：定期备份，使用事务
5. **性能优化**：
   - 批量写入减少 IO
   - 建立合理索引
   - 使用连接池
6. **媒体存储**：优先存储元数据，媒体文件按需下载
