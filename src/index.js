#!/usr/bin/env node

const fs = require('fs');
const rw = require('rw');
const arg = require('arg');
const path = require('path');
const toml = require('@iarna/toml');
const matter = require('gray-matter');
const recursive = require("recursive-readdir-sync");

const args = arg({
    '--help': Boolean,
    '--pretty': Boolean,            // JSON 格式化后输出
    '--verbose': Boolean,           // 展示操作日志
    '--display': Boolean,           // 仅用于显示
    '--no-content': Boolean,        // 没有内容
    // Aliases
    '-p': '--pretty',
    '-v': '--verbose',
    '-d': '--display',
});

const debug = args['--verbose'];

if (args['--help']) {
    const text = rw.readFileSync(path.resolve(process.cwd(), 'src/doc.txt'));
    console.log(text.toString());
    return process.exit(0);
}

const { _: dirs = [] } = args;

if (dirs.length < 2) { 
    return console.error('请指定输出文件：', dirs);
}

const target = path.resolve(process.cwd(), dirs.pop());

const extensions = ['.toml', '.md'];

const ignore = (file) => {
    return extensions.includes(path.extname(file));
};

const tree = { files: {}, items: [] };

dirs.forEach(dir => {
    const root = path.resolve(process.cwd(), dir);
    const files = recursive(root).filter(ignore);
    tree.files[root] = files;
    debug && console.log(root, files);
    files.forEach(file => {
        const text = rw.readFileSync(file);
        if (text instanceof Error) {
            debug && console.log('读取数据文件出错：', file);
            throw text;
        }
        switch (path.extname(file)) {
            case '.md':
                const { data, content, ...extra } = matter(text.toString(), {
                    engines: {
                        toml: toml.parse.bind(toml),
                    }
                });
                tree.items.push({
                    ...data,
                    ...extra,
                    filename: file,
                    content: content.trim(),
                });
                break;
            case '.toml':
                Object.assign(tree, toml.parse(text.toString()));
                break;
            default:
                console.log('other', file);
                break;
        }
    });
});

fs.mkdirSync(path.dirname(target), { recursive: true });
debug && console.log(`output path created: ${target}\n`);

const temp = (fs.lstatSync(target).isDirectory()) ? path.resolve(target, 'merged.json') : target;

rw.writeFileSync(temp, JSON.stringify(tree, null, 4));