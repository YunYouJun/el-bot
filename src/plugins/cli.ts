import Bot from 'src';
import { MessageType } from 'mirai-ts';
import shell from 'shelljs';

let reply: Function = (msg: string | MessageType.MessageChain) => {
  console.log(msg);
};
let qq = 0;

interface Job {
  name: string;
  do: string[];
}

interface Step {
  cmd: string;
  async: boolean;
}

/**
 * 执行对应任务
 * @param jobs
 * @param name
 */
function doJobByName(jobs: Job[], name: string) {
  jobs.forEach((job: Job) => {
    if (job.name && job.name === name && job.do) {
      job.do.forEach((step: string | Step) => {
        let cmd = '';
        let async = false;
        if (typeof step === 'string') {
          cmd = step;
        } else {
          cmd = step.cmd;
          async = step.async;
        }
        if (cmd.includes('el run ')) {
          name = cmd.slice(7);
          doJobByName(jobs, name);
        }
        shell.exec(cmd, {
          async,
        });
      });
    }
  });
}

/**
 * 根据选项做对应的事情
 * @param options 
 * @param ctx 
 */
function doByOptions(options: any, ctx: Bot) {
  if (options.a || options.about) {
    let about = '';
    about += 'GitHub: ' + ctx.pkg.repository.url + '\n';
    about += 'Docs: ' + ctx.pkg.homepage + '\n';
    about += 'SDK: ' + ctx.pkg.directories.lib + '\n';
    about +=
      'Author: ' + `${ctx.pkg.author.name} <${ctx.pkg.author.url}>` + '\n';
    about += 'Copyright: @ElpsyCN';
    reply(about);
  } else if (options.v || options.version) {
    reply(ctx.pkg.version);
  }
}

export default function cli(ctx: Bot) {
  const cli = ctx.cli;
  const mirai = ctx.mirai;
  const config = ctx.el.config;

  // 回声测试
  cli.command('echo <message>', '回声').action((args) => {
    if (!ctx.user.isAllowed(qq)) {
      reply('您没有操作权限');
    } else {
      reply(args);
    }
  });

  // 插件
  cli.command('plugins', '插件列表').action(() => {
    let content = '';

    if (config.plugins['default']) {
      content += ctx.plugins.list('default');
    }
    if (config.plugins['community']) {
      content += ctx.plugins.list('community');
    }
    if (config.plugins['custom']) {
      content += ctx.plugins.list('custom');
    }
    reply(content.slice(0, -1));
  });

  // 任务
  cli.command('jobs', '任务列表').action(async () => {
    if (!ctx.user.isAllowed(qq)) {
      await reply('您没有操作权限');
      return;
    }

    let content = '任务列表：';
    config.cli.jobs.forEach((job: Job) => {
      if (job.name) {
        content += '\n- ' + job.name;
      }
    });
    reply(content);
  });

  // 自定义任务
  cli.command('run <name>', '运行自定义任务').action(async (args) => {
    if (!ctx.user.isAllowed(qq)) {
      await reply('您没有操作权限');
      return;
    }

    if (config.cli && config.cli.jobs && config.cli.jobs.length > 0) {
      doJobByName(config.cli.jobs, args);
    }
  });

  // 重启
  cli.command('restart:mirai', '重启 mirai-console').action(async () => {
    if (!ctx.user.isAllowed(qq)) {
      await reply('您没有操作权限');
      return;
    }

    await reply('重启 mirai-console');

    const consolePid: number = parseInt(
      shell.exec('pgrep -f ./miraiOK_', {
        silent: true,
      }).stdout
    );
    const scriptPid: number = parseInt(
      shell.exec('pgrep -f start:mirai', {
        silent: true,
      }).stdout
    );
    process.kill(consolePid);
    process.kill(scriptPid);

    shell.exec('npm run start:mirai', (code, stdout, stderr) => {
      console.log('Exit code:', code);
      console.log('Program output:', stdout);
      console.log('Program stderr:', stderr);
    });

    setTimeout(() => {
      shell.exec('touch index.js');
    }, 5000);
  });


  // 关于
  cli.option('-a --about', '关于');
  // 版本
  cli.option('-v --version', '版本');

  // 帮助
  cli.help((sections) => {
    reply(
      sections
        .map((section) => {
          return section.title
            ? `${section.title}:\n${section.body}`
            : section.body;
        })
        .join('\n\n')
    );
  });

  mirai.on('message', (msg) => {
    if (!msg.sender) return;
    qq = msg.sender.id;
    reply = msg.reply;
    if (msg.plain.slice(0, 2) === 'el') {
      const cmd: string[] = msg.plain.split(' ').filter((item: string) => {
        return item !== '';
      });
      cmd.unshift('');

      try {
        const parsedArgv = cli.parse(cmd);
        doByOptions(parsedArgv.options, ctx);
      } catch (err) {
        reply(err.toString().slice(3));
      }
    }
  });
}

cli.version = '0.0.1';
cli.description = '交互终端';
