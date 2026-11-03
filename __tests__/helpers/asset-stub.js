// Metro 不认可的扩展名（.db）在测试里换成一个占位 asset id，
// 这样 src/app/_layout.tsx 里 require('@/assets/poetry.db') 也能跑通。
module.exports = 1;
