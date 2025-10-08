class GoldMiningGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 游戏状态
        this.gameState = 'idle'; // idle, playing, paused, gameOver
        this.level = 1;
        this.score = 0;
        this.targetScore = 500;
        this.timeLeft = 60;
        this.timeAccumulator = 0; // 整秒倒计时累积器
        
        // 矿工位置
        this.minerPosition = {
            x: this.canvas.width / 2,
            y: 50
        };
        
        // 钩子参数 - 参考ref实现
        this.swingAngle = 0; // 初始角度为0（垂直向下）
        this.swingSpeed = 0.05; // 摆动速度
        this.maxSwingAngle = (75 * Math.PI) / 180; // 最大摆动角度（75度，更明显）
        this.swingTime = 0; // 摆动时间累积（用于正弦摆动）
        this.swingFrequency = 0.8; // 摆动频率0.8Hz（稍慢的钟表摆动）
        this.hookAngle = 0; // 兼容原有代码
        this.hookSwingDirection = -1; // 初始向左摆动
        this.hookSwingSpeed = 3; // 摆动速度
        this.hookLength = 40;
        this.hookState = 'swinging'; // swinging, shooting, returning
        this.hookPosition = { x: this.minerPosition.x, y: this.minerPosition.y };
        
        // 基于时间的速度计算，确保在不同屏幕尺寸下速度一致
        this.hookSpeed = 300; // 每秒移动300像素，与屏幕尺寸无关
        
        this.maxShootLength = 450; // 发射最大长度，超过则回收
        this.caughtItem = null;
        
        // 物品数组
        this.items = [];
        
        // 游戏循环
        this.lastTime = 0;
        this.animationId = null;
        // 音频上下文延迟到首次用户交互才创建（遵循浏览器自动播放策略）
        this.audioCtx = null;
        // 全局音量倍率（>1放大，<1降低）
        this.masterVolume = 3.2;
        // 静音状态
        this.isMuted = false;
        
        this.initializeGame();
        this.setupEventListeners();
    }
    
    initializeGame() {
        this.updateUI();
        this.startGameLoop();
        
        // 初始绘制一次，确保Canvas内容可见
        setTimeout(() => {
            this.draw();
        }, 100);
        
        // 调试信息：检查游戏状态（已注释）
        // console.log('游戏初始化完成，状态:', this.gameState);
        // console.log('钩子状态:', this.hookState);
        // console.log('钩子角度:', this.hookAngle);
        // console.log('钩子位置:', this.hookPosition);
        // console.log('钩子摆动方向:', this.hookSwingDirection);
        // console.log('游戏循环是否启动:', this.animationId !== null);
    }
    
    setupEventListeners() {
        // 按钮事件
        document.getElementById('startBtn').addEventListener('click', () => this.startGame());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseGame());
        document.getElementById('restartBtn').addEventListener('click', () => this.restartGame());
        // 静音按钮（右上角悬浮，若不存在则创建/应用样式）
        (() => {
            const existing = document.getElementById('muteBtn');
            const btn = existing || document.createElement('button');
            if (!existing) {
                btn.id = 'muteBtn';
                btn.textContent = '静音';
                // 样式：右上角悬浮圆形按钮
                btn.style.position = 'fixed';
                btn.style.top = '12px';
                btn.style.right = '12px';
                btn.style.width = '40px';
                btn.style.height = '40px';
                btn.style.borderRadius = '20px';
                btn.style.background = 'rgba(0, 0, 0, 0.4)';
                btn.style.color = '#FFFFFF';
                btn.style.border = '1px solid rgba(255, 255, 255, 0.6)';
                btn.style.cursor = 'pointer';
                btn.style.backdropFilter = 'blur(4px)';
                btn.style.zIndex = '999';
                btn.style.fontSize = '14px';
                // 居中与多行支持
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                btn.style.textAlign = 'center';
                btn.style.lineHeight = 'normal';
                btn.onmouseenter = () => btn.style.background = 'rgba(0, 0, 0, 0.55)';
                btn.onmouseleave = () => btn.style.background = 'rgba(0, 0, 0, 0.4)';
                document.body.appendChild(btn);
            } else {
                // 如果已存在，则确保样式为悬浮按钮
                btn.style.position = 'fixed';
                btn.style.top = '12px';
                btn.style.right = '12px';
                btn.style.width = '40px';
                btn.style.height = '40px';
                btn.style.borderRadius = '20px';
                btn.style.background = btn.style.background || 'rgba(0, 0, 0, 0.4)';
                btn.style.color = '#FFFFFF';
                btn.style.border = '1px solid rgba(255, 255, 255, 0.6)';
                btn.style.cursor = 'pointer';
                btn.style.backdropFilter = 'blur(4px)';
                btn.style.zIndex = '999';
            }
            btn.onclick = () => this.toggleMute();
        })();
        
        // 画布点击事件
        this.canvas.addEventListener('click', (e) => {
            if (this.gameState === 'playing' && this.hookState === 'swinging') {
                this.playClick();
                this.shootHook();
            }
        });
        
        // 键盘控制
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.gameState === 'playing' && this.hookState === 'swinging') {
                    this.playClick();
                    this.shootHook();
                }
            } else if (e.code === 'KeyP') {
                e.preventDefault();
                this.pauseGame();
            } else if (e.code === 'KeyR') {
                e.preventDefault();
                this.restartGame();
            } else if (e.code === 'KeyM') {
                e.preventDefault();
                this.toggleMute();
            }
        });
        
        // 触摸设备支持
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.gameState === 'playing' && this.hookState === 'swinging') {
                this.playClick();
                this.shootHook();
            }
        });
    }
    
    startGame() {
        if (this.gameState === 'gameOver') {
            this.restartGame();
        }
        if (this.gameState === 'idle' || this.gameState === 'paused') {
            this.gameState = 'playing';
            // 在游戏开始时生成物品
            if (this.items.length === 0) {
                this.generateItems();
            }
            this.updateUI();
            
            // 强制重绘一次，解决浏览器渲染问题
            this.forceRedraw();
            
            // 调试信息：确认游戏状态切换（已注释）
            // console.log('startGame: 游戏状态已切换到playing');
            // console.log('钩子状态:', this.hookState);
            // console.log('钩子角度:', this.hookAngle);
        }
    }
    
    forceRedraw() {
        // 强制Canvas重绘，解决某些浏览器的渲染问题
        const temp = this.canvas.style.display;
        this.canvas.style.display = 'none';
        void this.canvas.offsetHeight; // 触发重排
        this.canvas.style.display = temp;
        
        // 立即执行一次完整的绘制
        this.draw();
    }
    
    // 简易音频系统
    ensureAudio() {
        if (!this.audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            try {
                this.audioCtx = new Ctx();
            } catch (e) {
                console.warn('AudioContext 初始化失败', e);
            }
        } else if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }
    
    playTone(freq = 600, duration = 0.08, type = 'sine', volume = 0.06) {
        this.ensureAudio();
        if (!this.audioCtx) return;
        const ctx = this.audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        const finalVol = this.isMuted ? 0.0001 : Math.min(1, Math.max(0.0001, volume * (this.masterVolume || 1)));
        gain.gain.setValueAtTime(finalVol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.01);
    }
    
    playClick() {
        // 短促的点击音
        this.playTone(800, 0.05, 'square', 0.05);
    }
    
    playCatch(itemType) {
        // 不同物品不同音色/音高
        switch (itemType) {
            case 'gold':
                this.playTone(620, 0.12, 'sine', 0.06);
                break;
            case 'diamond':
                // 双音上扬
                this.playTone(900, 0.08, 'triangle', 0.06);
                setTimeout(() => this.playTone(1200, 0.09, 'triangle', 0.06), 70);
                break;
            case 'stone':
                this.playTone(420, 0.09, 'sawtooth', 0.05);
                break;
            case 'bomb':
                // 低沉提示
                this.playTone(220, 0.14, 'square', 0.06);
                break;
            default:
                this.playTone(600, 0.1, 'sine', 0.05);
        }
    }

    playTimeWarning() {
        // 紧凑的滴嗒声，用于10秒倒计时警告
        this.playTone(1000, 0.05, 'square', 0.04);
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('muteBtn');
        if (btn) {
            if (this.isMuted) {
                btn.innerHTML = '<span style="display:block;line-height:12px">取消<br>静音</span>';
                btn.style.fontSize = '11px';
            } else {
                btn.textContent = '静音';
                btn.style.fontSize = '14px';
            }
            btn.title = this.isMuted ? '点击取消静音 (M)' : '点击静音 (M)';
        }
        // 尝试恢复音频上下文
        this.ensureAudio();
    }
    
    pauseGame() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            document.getElementById('pauseBtn').textContent = '继续';
            this.updateUI();
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            document.getElementById('pauseBtn').textContent = '暂停';
            this.updateUI();
        }
    }
    
    restartGame() {
        this.level = 1;
        this.score = 0;
        this.targetScore = 500;
        this.timeLeft = 60;
        this.hookAngle = -10;
        this.hookState = 'swinging';
        this.hookPosition = { x: this.minerPosition.x, y: this.minerPosition.y };
        this.caughtItem = null;
        this.gameState = 'idle';
        this.generateItems();
        this.updateUI();
    }
    
    updateUI() {
        document.getElementById('level').textContent = this.level;
        document.getElementById('targetScore').textContent = this.targetScore;
        document.getElementById('timeLeft').textContent = Math.ceil(this.timeLeft);
        document.getElementById('currentScore').textContent = this.score;
        
        // 更新按钮状态
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        
        if (this.gameState === 'playing') {
            startBtn.disabled = true;
            pauseBtn.disabled = false;
        } else {
            startBtn.disabled = false;
            pauseBtn.disabled = this.gameState === 'idle';
        }
        // 同步静音按钮文案与样式（保持两行与字号）
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            if (this.isMuted) {
                muteBtn.innerHTML = '<span style="display:block;line-height:12px">取消<br>静音</span>';
                muteBtn.style.fontSize = '11px';
            } else {
                muteBtn.textContent = '静音';
                muteBtn.style.fontSize = '14px';
            }
        }
        
        // 应用统一主题样式（按钮与页面背景等）
        this.applyUITheme();
    }
    
    applyUITheme() {
        try {
            // 页面背景（冷色渐变，与Canvas协调）
            document.body.style.background = 'linear-gradient(180deg, #A0E9FF 0%, #89C2FF 55%, #FFE45E 100%)';
            document.body.style.color = '#1f2937';
            // 按钮主题
            const styleBtn = (btn, variant = 'primary') => {
                if (!btn) return;
                btn.style.border = 'none';
                btn.style.borderRadius = '8px';
                btn.style.padding = '8px 12px';
                btn.style.marginRight = '6px';
                btn.style.fontWeight = '600';
                btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                btn.style.transition = 'transform .05s ease, opacity .2s ease';
                btn.onmousedown = () => btn.style.transform = 'scale(0.98)';
                btn.onmouseup = () => btn.style.transform = 'scale(1)';
                if (variant === 'primary') {
                    // 青绿主按钮
                    btn.style.background = 'linear-gradient(180deg,#FDE047,#F59E0B)';
                    btn.style.color = '#052e2b';
                } else if (variant === 'secondary') {
                    // 冷蓝次按钮
                    btn.style.background = 'linear-gradient(180deg,#60a5fa,#3b82f6)';
                    btn.style.color = '#eef2ff';
                } else {
                    // 中性浅灰蓝
                    btn.style.background = 'linear-gradient(180deg,#FBCFE8,#F472B6)';
                    btn.style.color = '#1f2937';
                }
                if (btn.disabled) {
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'not-allowed';
                } else {
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }
            };
            styleBtn(document.getElementById('startBtn'), 'primary');
            styleBtn(document.getElementById('pauseBtn'), 'secondary');
            styleBtn(document.getElementById('restartBtn'), 'default');
            // 悬浮静音按钮边框微调
            const muteBtn = document.getElementById('muteBtn');
            if (muteBtn) {
                muteBtn.style.border = '1px solid rgba(255,255,255,0.7)';
            }
        } catch (e) {
            console.warn('applyUITheme failed:', e);
        }
    }
    
    getDifficultyConfig() {
        // 按关卡返回难度配置：物品数量与目标分
        const lvl = this.level;
        const base = { gold: 8, diamond: 2, stone: 5, bomb: 2 };
        const gold = Math.min(base.gold + lvl, 16);
        const diamond = Math.min(base.diamond + Math.floor(lvl / 2), 5);
        const stone = Math.min(base.stone + lvl, 12);
        const bomb = Math.min(base.bomb + Math.floor(lvl / 3), 6);
        
        // 动态目标分：基于当前得分或关卡基础值
        let targetScore;
        if (lvl === 1) {
            targetScore = 500; // 第1关固定目标
        } else {
            // 下一关目标分 = 当前得分 × 难度系数（确保递增）
            const baseScore = this.score || 500;
            const difficultyFactor = 1.3 + (lvl - 1) * 0.05; // 随关卡增加难度
            targetScore = Math.max(baseScore + 200, Math.round(baseScore * difficultyFactor));
        }
        
        return { goldCount: gold, diamondCount: diamond, stoneCount: stone, bombCount: bomb, targetScore };
    }
    
    generateItems() {
        this.items = [];
        
        // 根据关卡难度配置生成物品数量与分布
        const cfg = this.getDifficultyConfig();
        const goldCount = cfg.goldCount;
        const diamondCount = cfg.diamondCount;
        const stoneCount = cfg.stoneCount;
        const bombCount = cfg.bombCount;
        
        // 生成黄金（不同大小）- 确保在画布可见区域内
        for (let i = 0; i < goldCount; i++) {
            const size = Math.random() * 20 + 15; // [15,35]
            // 将size线性映射到分值[50,200]
            const minS = 15, maxS = 35;
            const t = Math.max(0, Math.min(1, (size - minS) / (maxS - minS)));
            const value = Math.round(50 + t * 150);
            this.items.push({
                type: 'gold',
                x: Math.random() * (this.canvas.width - 60) + 30,
                y: Math.random() * (this.canvas.height - 200) + 100, // 从100开始，避免太靠近顶部
                size,
                value
            });
        }
        
        // 生成钻石（稀有物品）
        for (let i = 0; i < diamondCount; i++) {
            this.items.push({
                type: 'diamond',
                x: Math.random() * (this.canvas.width - 40) + 20,
                y: Math.random() * (this.canvas.height - 200) + 100,
                size: 20,
                value: 300 + ((this.level - 1) * 50) // 第1关300分，每关增加50分
            });
        }
        
        // 生成石子（基础物品）
        for (let i = 0; i < stoneCount; i++) {
            this.items.push({
                type: 'stone',
                x: Math.random() * (this.canvas.width - 30) + 15,
                y: Math.random() * (this.canvas.height - 200) + 100,
                size: Math.random() * 10 + 10,
                value: Math.floor(Math.random() * 11) + 10 // 10-20分
            });
        }
        
        // 生成炸弹（危险物品）
        for (let i = 0; i < bombCount; i++) {
            this.items.push({
                type: 'bomb',
                x: Math.random() * (this.canvas.width - 30) + 15,
                y: Math.random() * (this.canvas.height - 200) + 100,
                size: 25,
                value: -10 // 固定减少10秒
            });
        }
        
        // 防止物品重叠
        this.preventItemOverlap();
    }
    
    preventItemOverlap() {
        // 简单的重叠检测和调整
        for (let i = 0; i < this.items.length; i++) {
            for (let j = i + 1; j < this.items.length; j++) {
                const item1 = this.items[i];
                const item2 = this.items[j];
                const dx = item1.x - item2.x;
                const dy = item1.y - item2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = (item1.size + item2.size) / 2 + 10;
                
                if (distance < minDistance) {
                    // 调整位置
                    const angle = Math.atan2(dy, dx);
                    const moveDistance = minDistance - distance;
                    item2.x += Math.cos(angle) * moveDistance;
                    item2.y += Math.sin(angle) * moveDistance;
                    
                    // 边界检查 - 确保在画布可见区域内
                    item2.x = Math.max(item2.size / 2 + 10, Math.min(this.canvas.width - item2.size / 2 - 10, item2.x));
                    item2.y = Math.max(item2.size / 2 + 80, Math.min(this.canvas.height - item2.size / 2 - 10, item2.y));
                }
            }
        }
    }
    
    shootHook() {
        if (this.hookState === 'swinging') {
            this.hookState = 'shooting';
        }
    }
    
    updateHook() {
        if (this.gameState !== 'playing') {
            console.log('updateHook: 游戏状态不是playing，跳过更新');
            return;
        }
        
        if (this.hookState === 'swinging') {
            // 钟表频率摆动：1Hz正弦函数，初始角度为0°（正下方）
            this.swingTime += this.deltaTime || 0;
            const omega = 2 * Math.PI * (this.swingFrequency || 1); // 1Hz
            this.swingAngle = this.maxSwingAngle * Math.sin(omega * this.swingTime);
            
            // 更新钩子位置（使用弧度制）
            this.hookPosition.x = this.minerPosition.x + Math.sin(this.swingAngle) * this.hookLength;
            this.hookPosition.y = this.minerPosition.y + Math.cos(this.swingAngle) * this.hookLength;
            
            // 兼容原有代码（角度转度数）
            this.hookAngle = this.swingAngle * 180 / Math.PI;
        }
        else if (this.hookState === 'shooting') {
            // 钩子发射逻辑 - 基于时间而非像素，确保速度一致
            const speed = this.hookSpeed * (this.deltaTime || 0.016); // 转换为每秒像素
            const angleRad = (this.hookAngle * Math.PI) / 180;
            this.hookPosition.x += Math.sin(angleRad) * speed;
            this.hookPosition.y += Math.cos(angleRad) * speed;
            
            // 最大伸出长度检测（超过则回收）
            {
                const dx0 = this.hookPosition.x - this.minerPosition.x;
                const dy0 = this.hookPosition.y - this.minerPosition.y;
                const dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
                if (dist0 >= this.maxShootLength) {
                    this.hookState = 'returning';
                }
            }
            
            // 碰撞检测
            this.checkCollisions();
            
            // 边界检测
            if (this.hookPosition.x < 0 || this.hookPosition.x > this.canvas.width ||
                this.hookPosition.y < 0 || this.hookPosition.y > this.canvas.height) {
                this.hookState = 'returning';
            }
        }
        else if (this.hookState === 'returning') {
            // 钩子返回逻辑 - 基于时间而非像素，确保速度一致
            const speed = this.hookSpeed * 2 * (this.deltaTime || 0.016); // 返回速度加倍
            const dx = this.minerPosition.x - this.hookPosition.x;
            const dy = this.minerPosition.y - this.hookPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 2) { // 减小阈值，避免频闪
                // 确保钩子完全回到原点
                this.hookPosition.x = this.minerPosition.x;
                this.hookPosition.y = this.minerPosition.y;
                this.hookState = 'swinging';
                
                // 处理抓取的物品
                if (this.caughtItem) {
                    this.processCaughtItem();
                    this.caughtItem = null;
                }
            } else {
                // 使用基于时间的速度，确保平滑移动
                const moveDistance = Math.min(distance, speed); // 避免超调
                this.hookPosition.x += (dx / distance) * moveDistance;
                this.hookPosition.y += (dy / distance) * moveDistance;
            }
        }
    }
    
    checkCollisions() {
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const dx = this.hookPosition.x - item.x;
            const dy = this.hookPosition.y - item.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 精确碰撞检测，考虑物品类型和大小
            const collisionRadius = item.size / 2 + 8; // 钩子尖端半径 + 缓冲距离
            
            if (distance < collisionRadius) {
                this.caughtItem = item;
                this.items.splice(i, 1);
                this.hookState = 'returning';
                
                // 碰撞特效反馈
                this.showCollisionEffect(this.hookPosition.x, this.hookPosition.y, item.type);
                break;
            }
        }
    }
    
    showCollisionEffect(x, y, itemType) {
        // 碰撞特效（视觉反馈）
        const effect = {
            x: x,
            y: y,
            radius: 5,
            maxRadius: 20,
            alpha: 1,
            color: this.getItemEffectColor(itemType)
        };
        
        // 简单的粒子效果
        const animateEffect = () => {
            if (effect.radius < effect.maxRadius && effect.alpha > 0) {
                effect.radius += 1;
                effect.alpha -= 0.05;
                
                this.ctx.save();
                this.ctx.globalAlpha = effect.alpha;
                this.ctx.strokeStyle = effect.color;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
                
                requestAnimationFrame(animateEffect);
            }
        };
        
        animateEffect();
    }
    
    getItemEffectColor(itemType) {
        switch (itemType) {
            case 'gold': return '#FFD700';
            case 'diamond': return '#1E90FF';
            case 'stone': return '#A9A9A9';
            case 'bomb': return '#FF4500';
            default: return '#FFFFFF';
        }
    }
    
    processCaughtItem() {
        let scoreChange = 0;
        let timeChange = 0;
        let message = '';
        
        if (this.caughtItem.type === 'bomb') {
            timeChange = this.caughtItem.value; // 负数，减少时间
            message = `炸弹! -10秒`;
        } else {
            scoreChange = this.caughtItem.value;
            message = `+${scoreChange}分`;
            
            if (this.caughtItem.type === 'diamond') {
                timeChange = 5; // 钻石奖励5秒
                message += ' +5秒';
            }
        }
        
        // 抓取音效
        this.playCatch(this.caughtItem.type);
        
        // 更新分数和时间
        this.score += scoreChange;
        this.timeLeft = Math.max(0, this.timeLeft + timeChange);
        
        // 显示得分动画
        this.showScoreAnimation(this.hookPosition.x, this.hookPosition.y, message, this.caughtItem.type);
        
        this.updateUI();
        
        // 检查关卡完成条件
        if (this.score >= this.targetScore) {
            setTimeout(() => this.nextLevel(), 1000); // 延迟1秒进入下一关
        }
    }
    
    nextLevel() {
        this.level++;
        const cfg = this.getDifficultyConfig();
        this.targetScore = cfg.targetScore;
        this.timeLeft = 60;
        this.generateItems();
        
        // 关卡过渡效果
        this.showLevelTransition();
        this.updateUI();
    }
    
    showScoreAnimation(x, y, message, itemType) {
        const animation = {
            x: x,
            y: y,
            text: message,
            alpha: 1,
            yOffset: 0,
            color: this.getItemEffectColor(itemType),
            duration: 60 // 帧数
        };
        
        const animateScore = (frame = 0) => {
            if (frame < animation.duration) {
                animation.yOffset += 1;
                animation.alpha = 1 - (frame / animation.duration);
                
                this.ctx.save();
                this.ctx.globalAlpha = animation.alpha;
                this.ctx.fillStyle = animation.color;
                this.ctx.font = 'bold 16px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(animation.text, animation.x, animation.y - animation.yOffset);
                this.ctx.textAlign = 'left';
                this.ctx.restore();
                
                setTimeout(() => animateScore(frame + 1), 16); // 约60fps
            }
        };
        
        animateScore();
    }
    
    showLevelTransition() {
        // 关卡过渡动画
        let transitionAlpha = 0;
        const transitionDuration = 1000; // 1秒
        
        const animateTransition = (startTime) => {
            const currentTime = performance.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / transitionDuration, 1);
            
            transitionAlpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
            
            this.ctx.save();
            this.ctx.globalAlpha = transitionAlpha;
            this.ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 36px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`第 ${this.level} 关`, this.canvas.width / 2, this.canvas.height / 2 - 30);
            this.ctx.font = 'bold 24px Arial';
            this.ctx.fillText(`目标分数: ${this.targetScore}`, this.canvas.width / 2, this.canvas.height / 2 + 20);
            this.ctx.textAlign = 'left';
            this.ctx.restore();
            
            if (progress < 1) {
                requestAnimationFrame(() => animateTransition(startTime));
            }
        };
        
        animateTransition(performance.now());
    }
    
    updateGameTime() {
        if (this.gameState === 'playing') {
            // 使用时间累积器按整秒递减
            this.timeAccumulator = (this.timeAccumulator || 0) + (this.deltaTime || 0);
            if (this.timeAccumulator >= 1 && this.timeLeft > 0) {
                const tick = Math.floor(this.timeAccumulator);
                this.timeLeft = Math.max(0, this.timeLeft - tick);
                this.timeAccumulator -= tick;
                this.updateUI();
                
                // 在整秒递减时检查是否需要播放时间警告音效
                if (this.timeLeft <= 10 && this.timeLeft > 0) {
                    this.playTimeWarning();
                }
            }
            
            // 时间警告效果（最后10秒，按整秒闪烁，减少频闪）
            if (this.timeLeft <= 10 && this.timeLeft > 0) {
                const sec = Math.ceil(this.timeLeft);
                this.canvas.style.borderColor = (sec % 2 === 0) ? '#FF0000' : '#F59E0B';
                
                // 时间警告音效（紧凑滴嗒声）- 在整秒时播放
                if (this.timeAccumulator >= 1) {
                    this.playTimeWarning();
                }
            }
            
            if (this.timeLeft <= 0) {
                this.gameState = 'gameOver';
                this.showGameOver();
                this.updateUI();
            }
        }
    }
    
    showGameOver() {
        // 游戏结束动画
        let gameOverAlpha = 0;
        const gameOverDuration = 2000; // 2秒
        
        const animateGameOver = (startTime) => {
            const currentTime = performance.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / gameOverDuration, 1);
            
            gameOverAlpha = Math.min(progress * 2, 1);
            
            this.ctx.save();
            this.ctx.globalAlpha = gameOverAlpha * 0.7;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.globalAlpha = gameOverAlpha;
            this.ctx.fillStyle = '#FF0000';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('游戏结束', this.canvas.width / 2, this.canvas.height / 2 - 50);
            
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 24px Arial';
            this.ctx.fillText(`最终分数: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.fillText(`达到关卡: ${this.level}`, this.canvas.width / 2, this.canvas.height / 2 + 40);
            this.ctx.textAlign = 'left';
            this.ctx.restore();
            
            if (progress < 1) {
                requestAnimationFrame(() => animateGameOver(startTime));
            }
        };
        
        animateGameOver(performance.now());
        // 显示透明模态框与“再来一局”按钮
        (() => {
            const existing = document.getElementById('gameOverModal');
            let modal = existing || document.createElement('div');
            if (!existing) {
                modal.id = 'gameOverModal';
                modal.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);z-index:1001;';
                const card = document.createElement('div');
                card.style.cssText = 'background:rgba(255,255,255,0.85);backdrop-filter:blur(6px);border-radius:12px;padding:24px 28px;box-shadow:0 8px 32px rgba(0,0,0,0.25);text-align:center;color:#1f2937;';
                card.innerHTML = '<div style="font-size:24px;font-weight:700;margin-bottom:12px;">游戏结束</div><button id="retryBtn" style="margin-top:8px;border:none;border-radius:8px;padding:10px 16px;background:linear-gradient(180deg,#FDE047,#F59E0B);color:#052e2b;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.1);">再来一局</button>';
                modal.appendChild(card);
                document.body.appendChild(modal);
            }
            modal.style.display = 'flex';
            const retryBtn = document.getElementById('retryBtn');
            if (retryBtn) {
                retryBtn.onclick = () => {
                    modal.style.display = 'none';
                    this.restartGame();
                    this.startGame();
                };
            }
        })();
    }
    
    draw() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制背景（土壤）
        this.drawBackground();
        
        // 只在游戏进行中或暂停时绘制物品
        if (this.gameState === 'playing' || this.gameState === 'paused') {
            this.drawItems();
        }
        
        // 绘制矿工和钩子
        this.drawMinerAndHook();
        
        // 绘制游戏状态信息
        this.drawGameInfo();
    }
    
    drawBackground() {
        // 冷色竖向渐变（蓝绿）
        const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        grad.addColorStop(0, '#A0E9FF');   // 浅蓝
        grad.addColorStop(0.55, '#89C2FF'); // 清爽蓝
        grad.addColorStop(1, '#FFE45E');   // 阳光奶油黄
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 柔和暗角（vignette）
        const vg = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, Math.min(this.canvas.width, this.canvas.height) * 0.35,
            this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) * 0.75
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.12)');
        this.ctx.fillStyle = vg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawItems() {
        if (this.items.length === 0) return;
        
        this.items.forEach(item => {
            this.ctx.save();
            this.ctx.translate(item.x, item.y);
            
            switch (item.type) {
                case 'gold':
                    // 黄金 - 带有光泽效果
                    this.ctx.fillStyle = '#FFD700';
                    this.ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
                    this.ctx.shadowBlur = 12;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // 高光效果
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    this.ctx.beginPath();
                    this.ctx.arc(-item.size/6, -item.size/6, item.size/4, 0, Math.PI * 2);
                    this.ctx.fill();
                    break;
                    
                case 'diamond':
                    // 钻石 - 多面体效果
                    this.ctx.fillStyle = '#1E90FF';
                    this.ctx.shadowColor = 'rgba(30, 144, 255, 0.7)';
                    this.ctx.shadowBlur = 15;
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, -item.size / 2);
                    this.ctx.lineTo(item.size / 2, 0);
                    this.ctx.lineTo(0, item.size / 2);
                    this.ctx.lineTo(-item.size / 2, 0);
                    this.ctx.closePath();
                    this.ctx.fill();
                    
                    // 钻石切割面
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, -item.size / 2);
                    this.ctx.lineTo(0, item.size / 2);
                    this.ctx.moveTo(-item.size / 2, 0);
                    this.ctx.lineTo(item.size / 2, 0);
                    this.ctx.stroke();
                    break;
                    
                case 'stone':
                    // 石子 - 加深灰以增强对比
                    this.ctx.fillStyle = '#7B8D97'; // 深灰蓝
                    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.30)';
                    this.ctx.shadowBlur = 6;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // 细微纹理点
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                    for (let i = 0; i < 3; i++) {
                        const angle = (i * 120) * Math.PI / 180;
                        const x = Math.cos(angle) * item.size / 4;
                        const y = Math.sin(angle) * item.size / 4;
                        this.ctx.beginPath();
                        this.ctx.arc(x, y, 2, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    break;
                    
                case 'bomb':
                    // 炸弹 - 危险警示
                    this.ctx.fillStyle = '#000000';
                    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.shadowBlur = 8;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // 炸弹引线（改为深灰蓝）
                    this.ctx.fillStyle = '#334155';
                    this.ctx.fillRect(-2, -item.size/2 - 5, 4, 8);
                    
                    // 危险符号
                    this.ctx.fillStyle = '#FFFFFF';
                    this.ctx.font = 'bold 14px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText('!', 0, 0);
                    this.ctx.textAlign = 'left';
                    break;
            }
            
            this.ctx.restore();
        });
    }
    
    drawMinerAndHook() {
        // 绘制矿工（现代低饱和配色）
        this.ctx.fillStyle = '#2E3440'; // 机身：深灰蓝
        this.ctx.fillRect(this.minerPosition.x - 25, this.minerPosition.y - 40, 50, 40);
        
        // 矿工细节
        this.ctx.fillStyle = '#4C566A'; // 帽子：中灰蓝
        this.ctx.fillRect(this.minerPosition.x - 15, this.minerPosition.y - 35, 30, 10); // 帽子
        
        this.ctx.fillStyle = '#D8B4A0'; // 肤色更自然
        this.ctx.fillRect(this.minerPosition.x - 10, this.minerPosition.y - 25, 20, 15); // 脸部
        
        // 绘制钩子（带动态效果）
        const angleRad = (this.hookAngle * Math.PI) / 180;
        const hookEndX = this.minerPosition.x + Math.sin(angleRad) * this.hookLength;
        const hookEndY = this.minerPosition.y + Math.cos(angleRad) * this.hookLength;
        
        // 调试信息：检查钩子位置计算
        if (Math.random() < 0.01) {
            // console.log('钩子绘制 - 角度:', this.hookAngle.toFixed(2), '位置:', {x: hookEndX.toFixed(2), y: hookEndY.toFixed(2)});
        }
        
        // 钩子线（带阴影效果）
        this.ctx.strokeStyle = '#4A4A4A';
        this.ctx.lineWidth = 4;
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.minerPosition.x, this.minerPosition.y);
        
        if (this.hookState === 'swinging') {
            this.ctx.lineTo(hookEndX, hookEndY);
            this.hookPosition = { x: hookEndX, y: hookEndY };
        } else {
            this.ctx.lineTo(this.hookPosition.x, this.hookPosition.y);
        }
        
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
        
        // 钩子尖端（动态效果）
        let hookTipColor = '#FF4500';
        let hookTipSize = 6;
        
        if (this.hookState === 'shooting') {
            hookTipColor = '#FF0000';
            hookTipSize = 8;
        } else if (this.hookState === 'returning' && this.caughtItem) {
            hookTipColor = this.getItemEffectColor(this.caughtItem.type);
            hookTipSize = 7;
        }
        
        this.ctx.fillStyle = hookTipColor;
        this.ctx.beginPath();
        this.ctx.arc(this.hookPosition.x, this.hookPosition.y, hookTipSize, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制抓取的物品（带旋转效果）
        if (this.caughtItem) {
            this.ctx.save();
            this.ctx.translate(this.hookPosition.x, this.hookPosition.y);
            
            // 物品旋转动画
            const rotation = performance.now() * 0.01;
            this.ctx.rotate(rotation * 0.1);
            
            switch (this.caughtItem.type) {
                case 'gold':
                    this.ctx.fillStyle = '#FFD700';
                    this.ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
                    this.ctx.shadowBlur = 10;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, this.caughtItem.size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                    break;
                    
                case 'diamond':
                    this.ctx.fillStyle = '#1E90FF';
                    this.ctx.shadowColor = 'rgba(30, 144, 255, 0.7)';
                    this.ctx.shadowBlur = 15;
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, -this.caughtItem.size / 2);
                    this.ctx.lineTo(this.caughtItem.size / 2, 0);
                    this.ctx.lineTo(0, this.caughtItem.size / 2);
                    this.ctx.lineTo(-this.caughtItem.size / 2, 0);
                    this.ctx.closePath();
                    this.ctx.fill();
                    break;
                    
                case 'stone':
                    this.ctx.fillStyle = '#7B8D97';
                    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                    this.ctx.shadowBlur = 5;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, this.caughtItem.size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                    break;
                    
                case 'bomb':
                    this.ctx.fillStyle = '#000000';
                    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.shadowBlur = 8;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, this.caughtItem.size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = '#334155';
                    this.ctx.fillRect(-3, -8, 6, 4);
                    break;
            }
            
            this.ctx.restore();
        }
    }
    
    drawGameInfo() {
        // 时间警告效果（仅用于状态提示的颜色，不再在Canvas上重复显示HUD）
        if (this.timeLeft <= 10) {
            this.ctx.fillStyle = this.timeLeft % 1 > 0.5 ? '#FF0000' : '#FFFFFF';
        } else {
            this.ctx.fillStyle = '#FFFFFF';
        }
        // 移除Canvas上的时间/分数/目标/关卡文字，统一由DOM元素显示
        
        // 游戏状态提示
        if (this.gameState === 'idle') {
            // 优化开始提示样式 - 更美观的半透明卡片
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.roundRect(this.canvas.width / 2 - 120, this.canvas.height / 2 - 40, 240, 80, 12);
            this.ctx.fill();
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#1f2937';
            this.ctx.font = 'bold 17px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('点击"开始游戏"按钮开始冒险', this.canvas.width / 2, this.canvas.height / 2 - 8);
            this.ctx.font = 'normal 14px Arial';
            this.ctx.fillStyle = '#6b7280';
            this.ctx.fillText('点击屏幕或按空格键发射钩子', this.canvas.width / 2, this.canvas.height / 2 + 22);
            this.ctx.textAlign = 'left';
        }
        // 移除gameOver状态的Canvas文字提示（已由模态框替代）
    }
    
    gameLoop(currentTime) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        this.deltaTime = deltaTime;
        
        // 性能优化：取消跳帧，确保每帧都更新动画（避免摆动不明显）
        
        if (this.gameState === 'playing') {
            this.updateHook();
            this.updateGameTime();
            
            // 调试信息：检查游戏循环是否正常工作（已注释）
            if (Math.random() < 0.01) { // 1%概率输出调试信息，避免控制台刷屏
                // console.log('游戏循环运行中 - 钩子状态:', this.hookState, '角度:', this.hookAngle.toFixed(2));
            }
        }
        
        this.draw();
        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    startGameLoop() {
        this.lastTime = performance.now();
        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
    }
}

// 游戏初始化
window.addEventListener('load', () => {
    // 添加加载动画
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: white;
        font-family: Arial, sans-serif;
        z-index: 1000;
    `;
    
    loadingDiv.innerHTML = `
        <h1 style="font-size: 48px; margin-bottom: 20px;">黄金挖矿游戏</h1>
        <p style="font-size: 24px; margin-bottom: 30px;">加载中...</p>
        <div style="width: 100px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px;">
            <div style="width: 0%; height: 100%; background: #FFD700; border-radius: 2px; transition: width 0.3s;"></div>
        </div>
    `;
    
    document.body.appendChild(loadingDiv);
    
    // 模拟加载进度
    let progress = 0;
    const progressBar = loadingDiv.querySelector('div > div');
    const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setTimeout(() => {
                loadingDiv.style.opacity = '0';
                loadingDiv.style.transition = 'opacity 0.5s';
                setTimeout(() => {
                    document.body.removeChild(loadingDiv);
                    new GoldMiningGame();
                }, 500);
            }, 300);
        }
        progressBar.style.width = progress + '%';
    }, 100);
});

// 添加游戏说明
const gameInstructions = `
游戏说明：
- 点击屏幕或按空格键发射钩子
- 抓取黄金、钻石、石子获得分数
- 小心炸弹会减少时间
- 钻石额外奖励5秒时间
- 每关60秒内达到目标分数晋级
- 按P键暂停，R键重新开始
`;

// console.log(gameInstructions);