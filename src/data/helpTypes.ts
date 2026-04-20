export interface HelpTopic {
  id: string;
  title: string;
  description: string;
  steps?: string[];
  tips?: string[];
  relatedTopics?: string[];
  tags: string[];
}

export interface HelpCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  topics: HelpTopic[];
}
