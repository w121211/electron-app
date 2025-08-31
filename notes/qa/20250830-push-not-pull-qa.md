我想要使用 electron-app （作為一個使用者），叫 ai 來監督、管理我的 electron-app 專案的開發進度

有什麼東西會讓我每天一早就會想要打開 app ＆run？

- 最好的方式是，我不用打開 app，他就以經自動跑＆推送給我
- 利用不想浪費的心態，會想打開來先讓他無腦跑
- 當我寫好 todo ，但又覺得要開始做時很累，就會想讓他跑
- 或是當我不知道下一個要做什麼時，我也會想讓他跑 -> what’s next
- 跑的過程是越簡單越好，最好是點個鍵就跑
- 假設有個 todo-to-task.chat + @todos.md
  - agent 需要區分哪些已經實現，哪些還沒
    - 1. 自動一點的就是直接看 chats
    - 2. 簡單一點就是自己寫 - [x] ...
  - AI 會先給予各 task 的計畫
- Across multi projects （之後）
  - 例如我的 todos 是管理所有的 projects
  - 那我就需要

是不是一次直接對 todos 轉成 tasks 比較好？

- 不是不行，畢竟是一起的東西，一併討論比分開更好 -> 更容易了解使用者在想什麼

每次工作檢視的核心問題

- 目前做到哪？ where am I?
- 接下來要做什麼？ what's next?
- （可選）還差多少？
- 如何做？

為什麼我雖然寫了todo，卻不想實際去執行

- 代表執行本身「很讓人不想做」
- 列了很多工作，本身就很懶
- 所以最好的方式是，agent定期檢查，有更新就分析一遍，自動 deliver tasks，我被推著做

所以我想要的是什麼？

- Chat 1: 自動檢查 todos，把 todos 轉成 tasks，檢視討論優化 tasks
- Chat 2: 生成 tasks，依照前面的討論，生成 tasks (chat files)
  - Task: …
  - Setup:
    - Model:
    - Execute path:
  - Prompt: …
- 路徑
  - project.md
  - todos.md
  - commands/
    - “/todos check“
    - “/todos thread-to-tasks”
  - actions/
    - check-todos.chat - scheduled, template
    - thread-to-tasks.chat
    - todos-to-tasks.chat - 把兩個結合成一個，一步到位（這做法有好有壞）
      - 或是其實就是把 command prompts 當作提示，方便在需要的時候直接寫
  - chats/
    - YYYYMMDD-check-todos.chat
    - YYYYMMDD-todos-to-tasks.chat
    - YYYYMMDD-todos-to-tasks-1.chat
    - YYYYMMDD-todos-to-tasks-2.chat
    - YYYYMMDD-task1-hello-world.chat
    - YYYYMMDD-task2-hello-another-world.chat

怎樣管理專案？

- 我只有一個人，過度管理反而會拖慢
- 但如果不管理，進度也一直無法確定
- 我想到的目標有兩個
  - 1. release MVP
    - milestone
    - 要有多個測試過、成熟的 templates (workflows)，讓 user 可以打開即用，解決特定問題
    - 一方面也是以此作為宣傳
  - 2. 我作為app的使用者，用app實現管理、開發
    - 通過標準：需要我會真的想拿來使用，真的實用，確實解決掉我的問題，也確實會讓我持續使用

想法

- todos.md - 用來給我紀錄、筆記、編輯，比較亂，但會記錄我的想法
  - Backlog - 用於記錄想到的 todos，依時間序增加，最新在最下面，可標註優先級別（P0, P1, P2）
  - Daily log - 以日期為區塊，紀錄當日的想法、todos
    - 如果 todos 留空，則代表我還沒有安排 todos，需要 AI 推薦
- Project.md - 給 AI 關於此專案的基本資訊
