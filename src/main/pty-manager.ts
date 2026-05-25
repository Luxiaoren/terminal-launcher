import { EventEmitter } from 'events';
import { PtyCreateOptions, TerminalInstance, TerminalStatus, TerminalType } from '../shared/types';

/**
 * node-pty 实例接口（用于依赖注入和测试 mock）
 */
export interface IPtyProcess {
  pid: number;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitData: { exitCode: number; signal?: number }) => void) => void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

/**
 * node-pty 工厂接口（用于依赖注入和测试 mock）
 */
export interface IPtyFactory {
  spawn(
    shell: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
    }
  ): IPtyProcess;
}

/**
 * PtyManager 事件类型
 */
export interface PtyManagerEvents {
  data: (terminalId: string, data: string) => void;
  exit: (terminalId: string, exitCode: number) => void;
}

/** 终端数量上限 */
const MAX_TERMINALS = 20;

/** 启动超时时间（毫秒） */
const STARTUP_TIMEOUT_MS = 10000;

/**
 * PtyManager - 伪终端管理器
 *
 * 负责管理所有 node-pty 伪终端实例的生命周期。
 * 支持：
 * - 创建伪终端实例，设置工作目录和终端类型
 * - 向终端写入数据、调整尺寸、销毁终端
 * - 终端数量上限检查（最多 20 个）
 * - 启动超时处理（10 秒超时终止）
 * - 监听进程退出事件，区分正常退出和异常退出
 */
export class PtyManager extends EventEmitter {
  /** 活跃终端实例映射表 */
  private terminals: Map<string, TerminalInstance> = new Map();
  /** node-pty 进程映射表 */
  private ptyProcesses: Map<string, IPtyProcess> = new Map();
  /** 启动超时定时器映射表 */
  private startupTimers: Map<string, NodeJS.Timeout> = new Map();
  /** node-pty 工厂（支持依赖注入） */
  private ptyFactory: IPtyFactory;

  /**
   * @param ptyFactory node-pty 工厂实例（可选，默认使用真实 node-pty）
   *                   支持注入 mock 以便于单元测试
   */
  constructor(ptyFactory?: IPtyFactory) {
    super();
    if (ptyFactory) {
      this.ptyFactory = ptyFactory;
    } else {
      // 默认使用真实 node-pty
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pty = require('node-pty');
      this.ptyFactory = {
        spawn: (shell, args, options) => pty.spawn(shell, args, options),
      };
    }
  }

  /**
   * 创建新的伪终端实例
   * @param options 创建选项（工作目录、shell 路径、参数、环境变量）
   * @param terminalType 终端类型（默认 cmd）
   * @returns 终端实例 ID（UUID）
   * @throws 终端数量达到上限时抛出错误
   * @throws 启动超时时抛出错误
   */
  async create(options: PtyCreateOptions, terminalType: TerminalType = 'cmd'): Promise<string> {
    // 检查终端数量上限
    const activeCount = this.getActiveCount();
    if (activeCount >= MAX_TERMINALS) {
      throw new Error(`终端数量已达上限（最多 ${MAX_TERMINALS} 个），无法创建新终端`);
    }

    // 生成唯一 ID
    const terminalId = this.generateId();

    // 创建 node-pty 实例
    const ptyProcess = this.ptyFactory.spawn(
      options.shell,
      options.args || [],
      {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: options.cwd,
        env: options.env,
      }
    );

    // 创建终端实例记录
    const instance: TerminalInstance = {
      id: terminalId,
      cwd: options.cwd,
      terminalType,
      pid: ptyProcess.pid,
      status: 'running',
      createdAt: Date.now(),
    };

    // 存储实例
    this.terminals.set(terminalId, instance);
    this.ptyProcesses.set(terminalId, ptyProcess);

    // 监听数据输出事件
    ptyProcess.onData((data: string) => {
      this.emit('data', terminalId, data);
      // 收到数据说明终端已成功启动，清除超时定时器
      this.clearStartupTimer(terminalId);
    });

    // 监听进程退出事件
    ptyProcess.onExit(({ exitCode }) => {
      this.handleProcessExit(terminalId, exitCode);
    });

    // 设置启动超时处理
    this.setupStartupTimeout(terminalId);

    return terminalId;
  }

  /**
   * 向指定终端写入数据
   * @param terminalId 终端 ID
   * @param data 要写入的数据
   */
  write(terminalId: string, data: string): void {
    const ptyProcess = this.ptyProcesses.get(terminalId);
    if (!ptyProcess) {
      throw new Error(`终端 ${terminalId} 不存在或已关闭`);
    }
    ptyProcess.write(data);
  }

  /**
   * 调整终端尺寸
   * @param terminalId 终端 ID
   * @param cols 列数
   * @param rows 行数
   */
  resize(terminalId: string, cols: number, rows: number): void {
    const ptyProcess = this.ptyProcesses.get(terminalId);
    if (!ptyProcess) {
      throw new Error(`终端 ${terminalId} 不存在或已关闭`);
    }
    ptyProcess.resize(cols, rows);
  }

  /**
   * 销毁指定终端
   * 终止 node-pty 进程并从管理列表中移除
   * @param terminalId 终端 ID
   */
  async destroy(terminalId: string): Promise<void> {
    const ptyProcess = this.ptyProcesses.get(terminalId);
    if (!ptyProcess) {
      throw new Error(`终端 ${terminalId} 不存在或已关闭`);
    }

    // 清除启动超时定时器
    this.clearStartupTimer(terminalId);

    // 终止进程
    ptyProcess.kill();

    // 从管理列表中移除
    this.ptyProcesses.delete(terminalId);
    this.terminals.delete(terminalId);
  }

  /**
   * 获取当前活跃终端数量（状态为 running 的终端）
   */
  getActiveCount(): number {
    let count = 0;
    for (const instance of this.terminals.values()) {
      if (instance.status === 'running') {
        count++;
      }
    }
    return count;
  }

  /**
   * 获取指定终端实例信息
   * @param terminalId 终端 ID
   */
  getInstance(terminalId: string): TerminalInstance | undefined {
    return this.terminals.get(terminalId);
  }

  /**
   * 获取所有终端实例列表
   */
  getAllInstances(): TerminalInstance[] {
    return Array.from(this.terminals.values());
  }

  /**
   * 销毁所有终端（应用退出时调用）
   */
  async destroyAll(): Promise<void> {
    const ids = Array.from(this.ptyProcesses.keys());
    for (const id of ids) {
      try {
        await this.destroy(id);
      } catch {
        // 静默处理，确保所有终端都尝试清理
      }
    }
  }

  /**
   * 生成唯一终端 ID
   */
  private generateId(): string {
    // 使用 crypto 模块生成 UUID
    const { randomUUID } = require('crypto');
    return randomUUID();
  }

  /**
   * 设置启动超时处理
   * 如果 10 秒内未收到任何数据输出，认为启动失败，终止进程
   */
  private setupStartupTimeout(terminalId: string): void {
    const timer = setTimeout(() => {
      const instance = this.terminals.get(terminalId);
      if (instance && instance.status === 'running') {
        // 标记为错误状态
        instance.status = 'error';

        // 终止进程
        const ptyProcess = this.ptyProcesses.get(terminalId);
        if (ptyProcess) {
          ptyProcess.kill();
        }

        // 清理资源
        this.ptyProcesses.delete(terminalId);
        this.startupTimers.delete(terminalId);

        // 发出退出事件（使用 -1 表示超时）
        this.emit('exit', terminalId, -1);
      }
    }, STARTUP_TIMEOUT_MS);

    this.startupTimers.set(terminalId, timer);
  }

  /**
   * 清除启动超时定时器
   */
  private clearStartupTimer(terminalId: string): void {
    const timer = this.startupTimers.get(terminalId);
    if (timer) {
      clearTimeout(timer);
      this.startupTimers.delete(terminalId);
    }
  }

  /**
   * 处理进程退出事件
   * 区分正常退出（退出码 0）和异常退出（退出码非 0）
   */
  private handleProcessExit(terminalId: string, exitCode: number): void {
    // 清除启动超时定时器
    this.clearStartupTimer(terminalId);

    const instance = this.terminals.get(terminalId);
    if (instance) {
      // 更新终端状态
      instance.exitCode = exitCode;
      instance.status = exitCode === 0 ? 'exited' : 'error';
    }

    // 清理 pty 进程引用
    this.ptyProcesses.delete(terminalId);

    // 发出退出事件
    this.emit('exit', terminalId, exitCode);
  }
}
