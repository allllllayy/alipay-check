(function() {
    const hasChartJS = (typeof Chart !== 'undefined');
    let records = [];
    let chartInstances = {};
    let budgets = {};

    // 预设分类字典
    const EXPENSE_CATEGORIES = ['餐饮美食','交通出行','购物消费','居家生活','休闲娱乐','医疗健康','教育学习','金融手续费','其他流出'];
    const INCOME_CATEGORIES = ['薪资报酬','投资理财','节点挖矿','红包转账','兼职外包','其他流入'];
    const colorsFintech = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

    // ========== 1. 本地存储系统 ==========
    function loadStorage() {
        const saved = localStorage.getItem('fintech_pro_bills');
        records = saved ? JSON.parse(saved) : [];
        budgets = JSON.parse(localStorage.getItem('fintech_pro_budgets') || '{}');
    }
    function saveStorage() {
        localStorage.setItem('fintech_pro_bills', JSON.stringify(records));
        localStorage.setItem('fintech_pro_budgets', JSON.stringify(budgets));
    }

    // ========== 2. 核心 CSV 密码级解析算法 ==========
    function parseCSV(content) {
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        let headIdx = lines.findIndex(l => l.includes('交易时间') && l.includes('金额'));
        if(headIdx === -1) return [];
        const header = lines[headIdx].split(',');
        const col = {
            date: header.findIndex(h=>h.includes('交易时间')),
            type: header.findIndex(h=>h.includes('收/支')),
            amount: header.findIndex(h=>h.includes('金额')),
            merchant: header.findIndex(h=>h.includes('交易对方')),
            category: header.findIndex(h=>h.includes('交易分类')),
            status: header.findIndex(h=>h.includes('状态'))
        };

        const res = [];
        for (let i = headIdx + 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if(parts.length < 4) continue;
            if(col.status !== -1 && parts[col.status] && !parts[col.status].includes('成功')) continue;
            const date = (parts[col.date] || '').trim().split(' ')[0];
            const amtStr = (parts[col.amount] || '').replace(/[¥$,，]/g,'');
            const amt = parseFloat(amtStr);
            if(isNaN(amt) || amt === 0) continue;
            const typeRaw = parts[col.type] || '';
            let type = typeRaw.includes('收入') ? 'income' : (typeRaw.includes('支出') ? 'expense' : null);
            if(!type) continue;
            res.push({
                id: Date.now() + Math.random(),
                date, type, amount: amt,
                merchant: (parts[col.merchant] || '未知').trim(),
                category: (parts[col.category] || '其他').trim(),
                tag: 'none'
            });
        }
        return res;
    }

    // ========== 3. 核心指标量化监控引擎 ==========
    function updateStats() {
        const expRecs = records.filter(r => r.type === 'expense');
        const incRecs = records.filter(r => r.type === 'income');
        const exp = expRecs.reduce((s, r) => s + r.amount, 0);
        const inc = incRecs.reduce((s, r) => s + r.amount, 0);

        animateValue('balance', inc - exp);
        animateValue('totalIncome', inc);
        animateValue('totalExpense', exp);

        const maxExp = expRecs.length ? Math.max(...expRecs.map(r => r.amount)) : 0;
        animateValue('maxExpense', maxExp);

        const daysSet = new Set(expRecs.map(r => r.date));
        const activeDays = daysSet.size || 1;
        animateValue('burnRate', exp / activeDays);

        animateValue('savingsRate', inc > 0 ? ((inc - exp) / inc) * 100 : 0);

        const foodExp = expRecs.filter(r => r.category.includes('餐饮') || r.category.includes('买菜')).reduce((s, r) => s + r.amount, 0);
        animateValue('engelCoefficient', exp > 0 ? (foodExp / exp) * 100 : 0);

        const dailyExpMap = {};
        expRecs.forEach(r => dailyExpMap[r.date] = (dailyExpMap[r.date] || 0) + r.amount);
        const vals = Object.values(dailyExpMap);
        let vol = 0;
        if(vals.length > 1) {
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            vol = Math.sqrt(vals.reduce((acc, b) => acc + Math.pow(b - mean, 2), 0) / vals.length);
        }
        // ... (保持原本的 volatility 计算不变)
        animateValue('volatility', vol);

        // ================= 新增：绝对生存周期 (Cash Runway) 极客算法 =================
        const balance = inc - exp;
        const burnR = expRecs.length ? (exp / activeDays) : 0;
        let runway = 0;

        const runwayEl = document.getElementById('cashRunway');
        const runwayCard = document.getElementById('runwayCard');

        if (runwayEl && runwayCard) {
            if (balance > 0 && burnR > 0) {
                runway = balance / burnR; // 核心预测公式
                runwayEl.innerText = Math.floor(runway) + ' Days';

                // 智能预警状态机：<90天 报红警，>=90天 绿灯健康
                if (runway < 90) {
                    runwayCard.className = 'stat-card expense';
                    runwayCard.title = "🚨 流动性干涸风险极高，亟需注入新资本！";
                } else {
                    runwayCard.className = 'stat-card finance';
                    runwayCard.title = "✅ 资产池抗压健康。";
                }
            } else if (balance <= 0) {
                runwayEl.innerText = '0 Days';
                runwayCard.className = 'stat-card expense';
            } else if (balance > 0 && burnR === 0) {
                runwayEl.innerText = '∞ Days'; // 零消耗即永生
                runwayCard.className = 'stat-card income';
            }
        }
    }

    function animateValue(id, val) {
        const el = document.getElementById(id); if(!el) return;
        el.innerText = (el.dataset.suffix !== '%' ? '¥' : '') + val.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + (el.dataset.suffix || '');
    }

    // ========== 4. 【完美回归】资本流出偏好排行榜 ==========
    function updateCategoryRank() {
        const catTotals = {};
        records.filter(r => r.type === 'expense').forEach(r => catTotals[r.category] = (catTotals[r.category] || 0) + r.amount);
        const totalExp = Object.values(catTotals).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

        const tbody = document.getElementById('categoryRankBody');
        if (!tbody) return;

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px;">未捕获到流出数据碎片</td></tr>';
            return;
        }

        tbody.innerHTML = sorted.map(([cat, amt], i) => `
            <tr>
                <td>
                    <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background:${i<3?'#fef08a':'#f1f5f9'}; color:${i<3?'#ca8a04':'#64748b'}; border-radius:50%; font-weight:bold; font-size:12px;">
                        ${i+1}
                    </span>
                </td>
                <td style="font-weight:500;">${cat}</td>
                <td style="color:var(--expense);font-weight:600;">¥${amt.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                            <div style="height:100%; width:${totalExp > 0 ? (amt/totalExp)*100 : 0}%; background:var(--expense);"></div>
                        </div>
                        <span style="font-size:12px;color:#64748b;min-width:36px;">${totalExp > 0 ? ((amt/totalExp)*100).toFixed(1) : 0}%</span>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // ========== 5. 结构化风控与智能研报算法 ==========
    function refreshBudgetTab() {
        const mInput = document.getElementById('budgetMonth');
        if(!mInput.value) mInput.value = new Date().toISOString().substring(0, 7);
        const month = mInput.value;
        const currentCat = document.getElementById('budgetCategory').value || 'global';

        // 数据迁移与回显
        if (budgets[month] !== undefined && typeof budgets[month] === 'number') {
            budgets[month + '|global'] = budgets[month];
            delete budgets[month];
            saveStorage();
        }
        document.getElementById('budgetAmount').value = budgets[month + '|' + currentCat] || '';

        const mRecs = records.filter(r => r.date.startsWith(month));
        const mExpRecs = mRecs.filter(r => r.type === 'expense');
        const mExp = mExpRecs.reduce((s, r) => s + r.amount, 0);
        const mInc = mRecs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);

        const bStatus = document.getElementById('budgetStatus');
        let statusHtml = '';
        let globalBudget = 0;
        let contractStatus = '未部署';
        let subContractTags = '';
        let hasContracts = false;

        // 【核心】遍历当前月份部署的所有合约 (全局 + 定向)
        const activeContracts = Object.keys(budgets).filter(k => k.startsWith(month + '|'));

        if(activeContracts.length > 0) {
            hasContracts = true;
            activeContracts.forEach(key => {
                const cat = key.split('|')[1];
                const budgetAmt = budgets[key];
                if (budgetAmt <= 0) return;

                let scopeExp = 0;
                let title = '';
                if (cat === 'global') {
                    scopeExp = mExp;
                    title = '🌐 全局流动性合约';
                    globalBudget = budgetAmt;
                } else {
                    scopeExp = mExpRecs.filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0);
                    title = `🎯 定向风控：${cat}`;
                }

                const remain = budgetAmt - scopeExp;
                const pct = Math.min(100, (scopeExp / budgetAmt) * 100);
                const isDanger = remain < 0;
                const isWarn = !isDanger && pct > 80;
                let colorClass = isDanger ? 'danger' : (isWarn ? 'warning' : '');

                // 【核心升级】预言机动态枯竭预测 (仅在当前月份生效)
                let oracleWarning = '';
                const today = new Date();
                const [y, mStr] = month.split('-');
                const isCurrentMonth = (today.getFullYear() === parseInt(y) && (today.getMonth() + 1) === parseInt(mStr));

                if (isCurrentMonth && scopeExp > 0 && !isDanger) {
                    const daysPassed = today.getDate();
                    const burnRate = scopeExp / daysPassed;
                    const daysLeft = remain / burnRate;
                    const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

                    if (daysPassed + daysLeft <= totalDays) {
                        const depleteDate = new Date();
                        depleteDate.setDate(today.getDate() + Math.floor(daysLeft));
                        oracleWarning = `
                            <div style="background: rgba(239, 68, 68, 0.08); border-left: 3px solid #ef4444; padding: 10px 12px; border-radius: 6px; margin-top: 10px; font-size: 13px; color: #b91c1c;">
                                <strong>⚠️ 预言机测算：</strong>按当前日均燃烧速率 (¥${burnRate.toFixed(1)}/天)，此资金池将在 <strong>${Math.floor(daysLeft)} 天后 (即 ${depleteDate.getMonth()+1}月${depleteDate.getDate()}日)</strong> 彻底枯竭，触发强制熔断！
                            </div>`;
                    } else if (cat === 'global') {
                        oracleWarning = `
                            <div style="background: rgba(16, 185, 129, 0.08); border-left: 3px solid #10b981; padding: 10px 12px; border-radius: 6px; margin-top: 10px; font-size: 13px; color: #047857;">
                                <strong>🔮 预言机测算：</strong>按当前日均燃烧速率 (¥${burnRate.toFixed(1)}/天)，本纪元流动性可平稳渡过，未触及预警线。
                            </div>`;
                    }
                }

                // 研报标签收集
                if (isDanger) {
                    if (cat === 'global') contractStatus = '❌ 全局违约';
                    else subContractTags += `<span class="warning-tag">🚨 [${cat}] 预算已被击穿，合约强制锁死该分类敞口 (超额 ¥${Math.abs(remain).toFixed(2)})</span>`;
                } else if (isWarn && cat === 'global' && contractStatus !== '❌ 全局违约') {
                    contractStatus = '⚠️ 风险边缘';
                } else if (cat === 'global' && contractStatus === '未部署') {
                    contractStatus = '✅ 完美履约';
                }

                statusHtml += `
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-weight:600;font-size:14px;">
                            <span>${title} (已流出：¥${scopeExp.toLocaleString()})</span>
                            <span style="color:${isDanger?'var(--expense)':'var(--income)'}">安全垫：¥${remain.toLocaleString()} / ¥${budgetAmt.toLocaleString()}</span>
                        </div>
                        <div class="progress-bar"><div class="progress-fill ${colorClass}" style="width:${pct}%"></div></div>
                        ${oracleWarning}
                    </div>
                `;
            });
        }

        bStatus.innerHTML = hasContracts ? statusHtml : '<span style="color:#64748b;font-size:14px;">尚未部署任何维度的风控合约。</span>';

        const mintBtn = document.getElementById('mintNftBtn');
        const rGrid = document.getElementById('reportContainer');
        if(mRecs.length === 0) {
            rGrid.innerHTML = '<div style="grid-column: 1 / -1; color:#94a3b8; text-align:center;">此纪元无数据碎片。</div>';
            if (mintBtn) mintBtn.style.display = 'none';
            return;
        }
        if (mintBtn) mintBtn.style.display = 'inline-flex';

        const mCounts = {}; const mAmts = {};
        mExpRecs.forEach(r => {
            mCounts[r.merchant] = (mCounts[r.merchant] || 0) + 1;
            mAmts[r.merchant] = (mAmts[r.merchant] || 0) + r.amount;
        });
        const topMerchantAmt = Object.entries(mAmts).sort((a,b) => b[1] - a[1])[0] || ['无', 0];
        const topMerchantFreq = Object.entries(mCounts).sort((a,b) => b[1] - a[1])[0] || ['无', 0];
        const foodExp = mExpRecs.filter(r => r.category.includes('餐饮') || r.category.includes('买菜')).reduce((s, r) => s + r.amount, 0);
        const mEngel = mExp > 0 ? (foodExp / mExp) * 100 : 0;
        const maxR = mExpRecs.reduce((m, r) => r.amount > m.amount ? r : m, {amount:0, merchant:''});

        // 信用算力加权矩阵算法 (引入对子合约违约的惩罚)
        let score = 60;
        if (mInc > 0) {
            const saveRate = (mInc - mExp) / mInc;
            score += Math.max(-25, Math.min(25, saveRate * 50));
        } else if (mExp > 0 && mInc === 0) { score -= 20; }
        if (mExp > 0) { score += (30 - mEngel) * 0.3; }

        if (globalBudget > 0) {
            const usage = mExp / globalBudget;
            if (usage > 1) { score -= 15; }
            else if (usage > 0.8) { score -= 5; }
            else { score += 10; }
        }
        // 子合约违约连带扣分 (每个违约类目扣5分)
        if (subContractTags.length > 0) {
            score -= 5 * (subContractTags.match(/🚨/g) || []).length;
            if (contractStatus === '未部署') contractStatus = '⚠️ 局部触发熔断';
        }

        if (mExp > 0 && topMerchantAmt[1] / mExp > 0.4) { score -= 5; }
        score = Math.max(1, Math.min(99, Math.round(score)));
        if (score > 90 && mInc > 10000 && (mInc - mExp) / mInc > 0.6) score = 100;

        let rank, rankClass, rankDesc;
        if (score >= 90) { rank = 'SSS'; rankClass = 'rank-SSS'; rankDesc = '极度健康 · Web3 巨鲸节点'; }
        else if (score >= 80) { rank = 'S'; rankClass = 'rank-S'; rankDesc = '稳健 · 优质信用资产'; }
        else if (score >= 70) { rank = 'A'; rankClass = 'rank-A'; rankDesc = '良好 · 流动性充沛'; }
        else if (score >= 60) { rank = 'B'; rankClass = 'rank-B'; rankDesc = '亚健康 · 存在敞口风险'; }
        else if (score >= 40) { rank = 'C'; rankClass = 'rank-C'; rankDesc = '危险 · 濒临熔断边界'; }
        else { rank = 'D'; rankClass = 'rank-D'; rankDesc = '极度危险 · 资产枯竭预警'; }

        // 组装智能研报警告标签
        let riskTags = subContractTags; // 优先置顶子合约爆仓红字警告
        if(mEngel > 40) riskTags += `<span class="warning-tag">🚨 恩格尔系数过高 (${mEngel.toFixed(1)}%)</span>`;
        if(topMerchantFreq[1] > 10) riskTags += `<span class="warning-tag">⚠️ 节点高频依赖 (${topMerchantFreq[0]} 交易${topMerchantFreq[1]}次)</span>`;
        if(mExp > mInc && mInc > 0) riskTags += `<span class="warning-tag">🩸 现金流赤字</span>`;
        if(riskTags === '' && contractStatus !== '❌ 全局违约') riskTags = `<span class="info-tag">✅ 流动性架构及子合约执行状态健康</span>`;

        rGrid.innerHTML = `
            <div class="credit-score-card">
                <div style="flex: 1; min-width: 250px;">
                    <div class="score-title">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                        链上信用算力评级
                    </div>
                    <div class="score-display">
                        <span class="score-value">${score}</span>
                        <span class="score-rank ${rankClass}">${rank}</span>
                    </div>
                    <div class="score-desc">状态共识：${rankDesc}</div>
                </div>
                <div class="score-factors">
                    <div class="factor-item">储蓄蓄水率<strong style="color: ${mInc>mExp ? '#34d399' : '#ef4444'}">${mInc>0?((mInc-mExp)/mInc*100).toFixed(0):0}%</strong></div>
                    <div class="factor-item">恩格尔修正<strong style="color: ${mEngel<30 ? '#34d399' : (mEngel>50?'#ef4444':'#fbd38d')}">${mEngel.toFixed(1)}%</strong></div>
                    <div class="factor-item">合约履约<strong style="color: ${contractStatus.includes('✅')?'#34d399':(contractStatus.includes('❌')?'#ef4444':'white')}">${contractStatus}</strong></div>
                </div>
            </div>

            <div class="report-module">
                <h4>📊 宏观流动性诊断</h4>
                <p>总流入量级：<strong>¥${mInc.toLocaleString()}</strong></p>
                <p>总消耗量级：<strong>¥${mExp.toLocaleString()}</strong></p>
                <p>净结余流向：<strong style="color:${mInc>=mExp?'var(--income)':'var(--expense)'}">${mInc>=mExp?'盈余':'赤字'} ¥${Math.abs(mInc-mExp).toLocaleString()}</strong></p>
                <p>月度蓄水率：<strong>${mInc>0 ? ((mInc-mExp)/mInc*100).toFixed(1) : 0}%</strong></p>
            </div>
            <div class="report-module">
                <h4>🔬 微观交易行为穿透</h4>
                <p>最大资金黑洞：<strong>${topMerchantAmt[0]}</strong> (吸纳 ¥${topMerchantAmt[1].toLocaleString()})</p>
                <p>单笔峰值支出：<strong>¥${maxR.amount.toLocaleString()}</strong> (${maxR.merchant})</p>
                <p>最高频交互节点：<strong>${topMerchantFreq[0]}</strong> (共 ${topMerchantFreq[1]} 次握手)</p>
            </div>
            <div class="report-module" style="grid-column: 1 / -1; background: #fff;">
                <h4>🤖 智能风控与降级建议</h4>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">${riskTags}</div>
                <p style="color:#475569; font-size: 14.5px;">
                    ${mInc>=mExp ? '系统研判本纪元资产负债表扩张良性。' : '资产池处于失血状态。'}
                    ${mEngel>40 ? '刚需消费占比较大，财务结构存在僵化风险，抗风险能力降低。' : '消费结构弹性较好，非刚需资本流出健康。'}
                    ${maxR.amount > (mExp*0.3) ? '且存在超大额单点流出，建议在下个纪元收紧大额非必要开支敞口。' : ''}
                </p>
            </div>
        `;
    }

    // ========== 6. 核心图表安全渲染引擎 (彻底修复空白Bug) ==========
    function renderCharts() {
        if(!hasChartJS || records.length === 0) return;

        // 关键防护：利用 requestAnimationFrame 和 setTimeout 确保 DOM 彻底完成切换后再渲染图表
        requestAnimationFrame(() => {
            setTimeout(() => {
                Object.values(chartInstances).forEach(c => c && c.destroy());
                const expRecs = records.filter(r => r.type === 'expense');

                // (1) 资产累计水位图 (🔥 升级：注入未来 30 天趋势预测线)
                const dCtx = document.getElementById('cumulativeChart').getContext('2d');
                const dailyNet = {};
                const sortedDates = [...new Set(records.map(r => r.date))].sort();
                sortedDates.forEach(d => dailyNet[d] = 0);
                records.forEach(r => dailyNet[r.date] += (r.type === 'income' ? r.amount : -r.amount));

                let runTotal = 0;
                const cumData = sortedDates.map(d => runTotal += dailyNet[d]);

                // --- 预测核心逻辑 ---
                const activeDays = new Set(expRecs.map(r => r.date)).size || 1;
                const dailyBurnRate = expRecs.reduce((s, r) => s + r.amount, 0) / activeDays;
                const lastDateStr = sortedDates[sortedDates.length - 1] || new Date().toISOString().split('T')[0];
                const lastDateObj = new Date(lastDateStr);

                const futureDates = [];
                // 将预测起点与历史终点无缝拼接
                const projDataArray = new Array(sortedDates.length - 1).fill(null);
                projDataArray.push(runTotal);

                let currentProjTotal = runTotal;
                // 推演未来 30 天断水断粮的绝对下行轨迹
                for (let i = 1; i <= 30; i++) {
                    const nextD = new Date(lastDateObj);
                    nextD.setDate(lastDateObj.getDate() + i);
                    futureDates.push(nextD.toISOString().split('T')[0].substring(5)); // 仅显示月-日
                    currentProjTotal -= dailyBurnRate;
                    projDataArray.push(currentProjTotal);
                }

                const combinedLabels = [...sortedDates.map(d => d.substring(5)), ...futureDates];

                chartInstances['cum'] = new Chart(dCtx, {
                    type: 'line',
                    data: {
                        labels: combinedLabels,
                        datasets: [
                            { label: '真实资产净值', data: cumData, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.2)', fill: true, tension: 0.3, pointRadius: 0 },
                            { label: '预言机测算: 30日枯竭轨迹', data: projDataArray, borderColor: '#ef4444', borderDash: [5, 5], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'top' } },
                        scales: { x: { ticks: { maxTicksLimit: 10 } } }
                    }
                });

                // (2) 资金流出黑洞
                const mCtx = document.getElementById('merchantChart').getContext('2d');
                const mAmts = {}; expRecs.forEach(r => mAmts[r.merchant] = (mAmts[r.merchant] || 0) + r.amount);
                const top5 = Object.entries(mAmts).sort((a,b) => b[1] - a[1]).slice(0, 5);
                chartInstances['merch'] = new Chart(mCtx, {
                    type: 'bar', data: { labels: top5.map(t=>t[0].substring(0,8)), datasets: [{ label: '吸金量', data: top5.map(t=>t[1]), backgroundColor: '#f43f5e', borderRadius: 4 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}} }
                });

                // (3) 支出类目环形图 (🔥 已修复致命导致白板的 Legend Bug)
                const pCtx = document.getElementById('expenseChart').getContext('2d');
                const catAmts = {}; expRecs.forEach(r => catAmts[r.category] = (catAmts[r.category] || 0) + r.amount);
                chartInstances['pie'] = new Chart(pCtx, {
                    type: 'doughnut', data: { labels: Object.keys(catAmts), datasets: [{ data: Object.values(catAmts), backgroundColor: colorsFintech, borderWidth:0 }] },
                    // 注意这里的 legend 是一个纯对象了，绝不能加 []
                    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } }
                });

                // (4) 消费行为三维画像雷达图
                // (4) 消费行为三维画像雷达图 (🔥 升级：引入 Peer Benchmark 标准基准面)
                const rCtx = document.getElementById('radarChart').getContext('2d');
                const dims = {'生存刚需':0, '发展提升':0, '享乐消费':0, '其他':0};
                expRecs.forEach(r => {
                    if(/餐饮|买菜|医疗|住房/.test(r.category)) dims['生存刚需'] += r.amount;
                    else if(/教育|交通|书籍/.test(r.category)) dims['发展提升'] += r.amount;
                    else if(/娱乐|购物|游戏|旅游/.test(r.category)) dims['享乐消费'] += r.amount;
                    else dims['其他'] += r.amount;
                });

                // --- 基准面核心逻辑 ---
                const totalExpRadar = Object.values(dims).reduce((a, b) => a + b, 0);
                // 设定理想的中产健康模型：50%刚需, 30%自我提升, 15%享乐, 5%杂项
                const benchmarkData = [
                    totalExpRadar * 0.50,
                    totalExpRadar * 0.30,
                    totalExpRadar * 0.15,
                    totalExpRadar * 0.05
                ];

                chartInstances['radar'] = new Chart(rCtx, {
                    type: 'radar',
                    data: {
                        labels: Object.keys(dims),
                        datasets: [
                            {
                                label: '您的实际资金敞口',
                                data: Object.values(dims),
                                backgroundColor: 'rgba(16, 185, 129, 0.3)',
                                borderColor: '#10b981',
                                pointBackgroundColor: '#10b981'
                            },
                            {
                                label: '健康参考底模 (Benchmark)',
                                data: benchmarkData,
                                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                                borderColor: '#94a3b8',
                                borderDash: [5, 5],
                                pointBackgroundColor: '#94a3b8',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'bottom' } }
                    }
                });

                // (5) 周期复合流向柱状趋势图
                const bCtx = document.getElementById('monthlyChart').getContext('2d');
                const monthly = {};
                records.forEach(r => { const m = r.date.substring(0,7); if(!monthly[m]) monthly[m] = {i:0,e:0}; r.type === 'income' ? monthly[m].i += r.amount : monthly[m].e += r.amount; });
                const mKeys = Object.keys(monthly).sort();
                chartInstances['month'] = new Chart(bCtx, {
                    type: 'bar', data: { labels: mKeys, datasets: [
                            { type:'line', label:'净流动', data: mKeys.map(m=>monthly[m].i-monthly[m].e), borderColor:'#0f172a', tension:0.3 },
                            { type:'bar', label:'流入', data: mKeys.map(m=>monthly[m].i), backgroundColor:'rgba(16, 185, 129, 0.8)', borderRadius:4 },
                            { type:'bar', label:'流出', data: mKeys.map(m=>monthly[m].e), backgroundColor:'rgba(239, 68, 68, 0.8)', borderRadius:4 }
                        ] }, options: { responsive: true, maintainAspectRatio: false }
                });
            }, 50); // 50毫秒安全绘图延时
        });
    }

    // ========== 7. 数据列表检索与渲染 (带智能风控标红) ==========
    function updateTable() {
        const tb = document.getElementById('recordsBody');
        if(!tb) return;
        const typeEl = document.getElementById('typeFilter');
        const searchEl = document.getElementById('searchInput');

        const typeF = typeEl ? typeEl.value : 'all';
        const search = searchEl ? searchEl.value.toLowerCase() : '';
        const todayStr = new Date().toISOString().split('T')[0];

        let filtered = records.filter(r => {
            if (typeF !== 'all' && r.type !== typeF) return false;
            if (search) {
                const pseudoHash = '0x' + Math.abs(Math.sin(r.id) * 100000000).toString(16).substring(0, 12);
                const tagText = r.tag === 'reimburse' ? '可报销' : (r.tag === 'impulse' ? '冲动消费' : (r.tag === 'fixed' ? '固定刚需' : ''));
                if (!(r.merchant.toLowerCase().includes(search) ||
                    r.category.toLowerCase().includes(search) ||
                    tagText.includes(search) ||
                    pseudoHash.toLowerCase().includes(search))) return false;
            }
            return true;
        });

        tb.innerHTML = filtered.slice(0, 150).map(r => {
            const hash = '0x' + Math.abs(Math.sin(r.id) * 100000000).toString(16).substring(0, 12);
            const isPending = (todayStr === r.date);
            const statusHtml = isPending ? '<span class="status-badge status-pending">⏳ 打包中</span>' : '<span class="status-badge status-success">✅ 已确权</span>';

            const mKey = r.date.substring(0, 7);
            const monthlyBudget = budgets[mKey] || 0;
            const isAnomaly = r.type === 'expense' && monthlyBudget > 0 && r.amount > (monthlyBudget * 0.3);

            return `
                <tr class="${isAnomaly ? 'row-anomaly' : ''}" title="${isAnomaly ? '单点流动性消耗过大 (击穿当月风控线30%)' : ''}">
                    <td>
                        <span class="tx-hash" onclick="navigator.clipboard.writeText('${hash}'); alert('已复制指纹: ${hash}');" title="点击复制 TxHash">
                            ${hash.substring(0,8)}...
                        </span>
                    </td>
                    <td style="color:#64748b;">${r.date}</td>
                    <td><span style="color:${r.type==='income'?'var(--income)':'var(--expense)'};font-weight:bold;">${r.type==='income'?'流入':'流出'}</span></td>
                    <td>${r.category}</td>
                    <td>${r.merchant}</td>
                    <td style="font-weight:bold; color:${r.type==='income'?'var(--income)':'var(--expense)'}">
                        ${isAnomaly ? '<span class="anomaly-icon">⚠️</span>' : ''}¥${r.amount.toFixed(2)}
                    </td>
                    <td>
                        <select class="tag-selector" data-tag="${r.tag || 'none'}" onchange="window.changeRecordTag(${r.id}, this.value)">
                            <option value="none" ${r.tag === 'none' || !r.tag ? 'selected' : ''}>—</option>
                            <option value="reimburse" ${r.tag === 'reimburse' ? 'selected' : ''}>💼 可报销</option>
                            <option value="impulse" ${r.tag === 'impulse' ? 'selected' : ''}>🔥 冲动消费</option>
                            <option value="fixed" ${r.tag === 'fixed' ? 'selected' : ''}>🏠 固定刚需</option>
                        </select>
                    </td>
                    <td>${statusHtml}</td>
                </tr>`;
        }).join('') || '<tr><td colspan="8" style="text-align:center; padding:40px; color:#94a3b8;">未检索到匹配的交易记录</td></tr>';
    }

    window.changeRecordTag = function(id, newTag) {
        const idx = records.findIndex(r => r.id === id);
        if(idx !== -1) {
            records[idx].tag = newTag;
            saveStorage(); updateTable();
        }
    };

    // 核心全局刷新管线
    function refreshAll() {
        updateStats();
        updateCategoryRank(); // <--- 表格渲染在这里调用
        updateTable();
        if(document.getElementById('stats-tab') && document.getElementById('stats-tab').classList.contains('active')) renderCharts();
        if(document.getElementById('budget-tab') && document.getElementById('budget-tab').classList.contains('active')) refreshBudgetTab();
    }

    // ========== 8. 拖拽与文件上传控制系统 ==========
    const uploadArea = document.getElementById('uploadArea');
    const csvFile = document.getElementById('csvFile');
    if (uploadArea && csvFile) {
        uploadArea.addEventListener('click', () => csvFile.click());
        uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
        uploadArea.addEventListener('dragleave', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); });
        uploadArea.addEventListener('drop', e => {
            e.preventDefault(); uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                csvFile.files = e.dataTransfer.files;
                csvFile.dispatchEvent(new Event('change'));
            }
        });

        csvFile.addEventListener('change', e => {
            const file = e.target.files[0]; if(!file) return;
            const reader = new FileReader();
            reader.readAsText(file, 'UTF-8');
            reader.onload = e2 => {
                let content = e2.target.result;
                if(!content.includes('交易') && !content.includes('金额')) {
                    const gbkReader = new FileReader();
                    gbkReader.onload = e3 => processRecords(parseCSV(e3.target.result));
                    gbkReader.readAsText(file, 'GBK');
                } else {
                    processRecords(parseCSV(content));
                }
            };
            function processRecords(newRecs) {
                if(newRecs.length) {
                    records = newRecs.sort((a,b)=>b.date.localeCompare(a.date));
                    saveStorage(); refreshAll();
                    alert(`导入成功: 系统已覆盖渲染了 ${records.length} 条交易节点`);
                } else alert('未识别到有效流水数据');
            }
        });
    }

    // ========== 9. 交互事件绑定与表单注入核心区 ==========
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        this.classList.add('active');
        const target = document.getElementById(this.dataset.tab + '-tab');
        if(target) target.classList.add('active');
        refreshAll();
    }));

    const addTypeEl = document.getElementById('addType');
    const addCategoryEl = document.getElementById('addCategory');
    function fillAddCategories() {
        if(!addTypeEl || !addCategoryEl) return;
        const type = addTypeEl.value;
        const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        addCategoryEl.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    if(addTypeEl) addTypeEl.addEventListener('change', fillAddCategories);

    const addForm = document.getElementById('addForm');
    if(addForm) {
        addForm.addEventListener('submit', e => {
            e.preventDefault();
            const amt = parseFloat(document.getElementById('addAmount').value);
            const newRecord = {
                id: Date.now() + Math.random(),
                date: document.getElementById('addDate').value,
                type: addTypeEl.value,
                category: addCategoryEl.value,
                merchant: document.getElementById('addMerchant').value.trim(),
                amount: amt,
                tag: 'none'
            };
            records.unshift(newRecord);
            records.sort((a,b) => b.date.localeCompare(a.date));
            saveStorage();
            refreshAll();
            addForm.reset();
            fillAddCategories();
            alert('共识达成：成功往本地轻量链添加单条交易记录！');
        });
    }

    const typeFilterEl = document.getElementById('typeFilter');
    const searchInputEl = document.getElementById('searchInput');
    if(typeFilterEl) typeFilterEl.addEventListener('change', updateTable);
    if(searchInputEl) searchInputEl.addEventListener('input', updateTable);

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if(exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            if(!records.length) return alert('数据账本真空');
            let csv = '\uFEFF';
            csv += 'TxHash,时间戳,流向,分类,交易对手节点,金额(CNY),智能标签,网络状态\n';
            records.forEach(r => {
                const hash = '0x' + Math.abs(Math.sin(r.id) * 100000000).toString(16).substring(0, 12);
                const status = (new Date().toISOString().split('T')[0] === r.date) ? '打包中' : '已确权';
                const tagText = r.tag === 'reimburse' ? '可报销' : (r.tag === 'impulse' ? '冲动消费' : (r.tag === 'fixed' ? '固定刚需' : '无'));
                csv += `"${hash}","${r.date}","${r.type==='income'?'流入':'流出'}","${r.category}","${r.merchant}","${r.amount}","${tagText}","${status}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'Fintech_Ledger_Audit_Report.csv'; a.click();
            URL.revokeObjectURL(url);
        });
    }

    const generateHashBtn = document.getElementById('generateHashBtn');
    if (generateHashBtn) {
        generateHashBtn.addEventListener('click', async () => {
            if(!records.length) return alert('账本为空');
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records))))).map(b=>b.toString(16).padStart(2,'0')).join('');
            alert(`SHA-256 账本树快照总指纹:\n${hash}`);
        });
    }

    // ====== 保存风控合约按钮逻辑 ======
    // ====== 【增强】定向类目选项注入与联动联动 ======
    const budgetCategoryEl = document.getElementById('budgetCategory');
    if (budgetCategoryEl) {
        // 初始化注入类目
        EXPENSE_CATEGORIES.forEach(c => {
            budgetCategoryEl.insertAdjacentHTML('beforeend', `<option value="${c}">🎯 定向狙击: ${c}</option>`);
        });

        // 切换类目或月份时，自动回显对应的合约阈值
        const updateBudgetInput = () => {
            const m = document.getElementById('budgetMonth').value;
            const cat = budgetCategoryEl.value;
            if (m) {
                // 兼容老数据结构，平滑迁移
                if (budgets[m] !== undefined && typeof budgets[m] === 'number') {
                    budgets[m + '|global'] = budgets[m];
                    delete budgets[m];
                    saveStorage();
                }
                document.getElementById('budgetAmount').value = budgets[m + '|' + cat] || '';
            }
        };
        budgetCategoryEl.addEventListener('change', updateBudgetInput);
        document.getElementById('budgetMonth').addEventListener('change', () => {
            updateBudgetInput();
            refreshAll();
        });
    }

    // ====== 【增强】风控合约多维部署逻辑 ======
    const saveBudgetBtn = document.getElementById('saveBudgetBtn');
    if (saveBudgetBtn) {
        saveBudgetBtn.addEventListener('click', () => {
            const m = document.getElementById('budgetMonth').value;
            const cat = document.getElementById('budgetCategory').value;
            const a = parseFloat(document.getElementById('budgetAmount').value);
            if (m && a >= 0) {
                budgets[m + '|' + cat] = a;
                saveStorage();
                refreshAll();
            }
        });
    }

    // ====== 【修复：独立出来】铸造 NFT 快照按钮逻辑 ======
    const mintNftBtn = document.getElementById('mintNftBtn');
    if (mintNftBtn) {
        mintNftBtn.addEventListener('click', () => {
            const reportContainer = document.getElementById('reportContainer');
            if (!reportContainer || typeof html2canvas === 'undefined') {
                alert('环境就绪中或无可铸造的研报碎片（请确认已连接网络并成功加载 html2canvas）');
                return;
            }

            // 修改交互反馈：伪装上链打包动画
            const originalText = mintNftBtn.innerHTML;
            mintNftBtn.innerHTML = '⚡ 正在上链打包快照...';
            mintNftBtn.disabled = true;

            // 执行高级影子克隆截图
            html2canvas(reportContainer, {
                backgroundColor: null, // 允许透明或自定义
                scale: 2,             // Retina 双倍高清晰度采样
                useCORS: true,        // 跨域安全策略预备
                logging: false,       // 关闭冗余调试日志
                onclone: (clonedDoc) => {
                    // 极其巧妙的黑客视觉魔法：在内存的克隆体中为容器注入精美的发光背景，使其脱离单调的白底
                    const clonedContainer = clonedDoc.getElementById('reportContainer');
                    if (clonedContainer) {
                        clonedContainer.style.padding = '32px';
                        clonedContainer.style.background = 'linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)';
                        clonedContainer.style.borderRadius = '24px';
                        clonedContainer.style.width = '1000px'; // 强行锁死黄金画幅宽度，防止拉伸变形
                    }
                }
            }).then(canvas => {
                const imgData = canvas.toDataURL('image/png');
                const month = document.getElementById('budgetMonth').value || 'Epoch';

                // 触发客户端隐式流下载
                const link = document.createElement('a');
                link.download = `Fintech_Credit_NFT_Snapshot_${month}.png`;
                link.href = imgData;
                link.click();

                // 还原状态
                mintNftBtn.innerHTML = originalText;
                mintNftBtn.disabled = false;

                // 弹出沉浸式共识回执提示
                alert(`🎉 凭证铸造成功！\n\n研报快照已通过 SHA-256 树根共识进行前端确权并成功导出为本地图片。\n\n【🚀 商业化 PoC 演示要点】：\n该图片已将您的“TxHash交易指纹”与“100分制算力评级”封装在一起，在未来去中心化金融（DeFi）生态中，这张图片即可作为用户的财务健康凭证（Proof of Financial Health），用于向去中心化借贷平台直接申请低息贷款！`);
            }).catch(err => {
                console.error('Minting error:', err);
                mintNftBtn.innerHTML = originalText;
                mintNftBtn.disabled = false;
                alert('快照铸造发生意外断开，请检查控制台。');
            });
        });
    }

    // ====== 监听窗口变化重绘图表 ======
    window.addEventListener('resize', () => {
        if(document.getElementById('stats-tab') && document.getElementById('stats-tab').classList.contains('active')) renderCharts();
    });

    // ========== 10. 全面初始化运行 ==========
    loadStorage();
    if(document.getElementById('addDate')) document.getElementById('addDate').value = new Date().toISOString().split('T')[0];
    fillAddCategories();
    refreshAll();
})();
