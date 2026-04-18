import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, CheckCircle, Lightbulb, ArrowLeft, HelpCircle } from 'lucide-react';
import { helpCategories, searchHelpTopics, getCategoryById, getTopicById, type HelpCategory, type HelpTopic } from '@/data/helpContent';

const HelpPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    searchParams.get('category') || null
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    searchParams.get('topic') || null
  );

  // Buscar tópicos quando há termo de pesquisa
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return searchHelpTopics(searchTerm);
  }, [searchTerm]);

  // Categoria e tópico selecionados
  const selectedCategory = selectedCategoryId ? getCategoryById(selectedCategoryId) : null;
  const selectedTopic = selectedTopicId ? getTopicById(selectedTopicId) : null;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setSelectedCategoryId(null);
    setSelectedTopicId(null);
    // Atualizar URL
    if (value.trim()) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedTopicId(null);
    setSearchTerm('');
    setSearchParams({ category: categoryId });
  };

  const handleTopicSelect = (topicId: string) => {
    setSelectedTopicId(topicId);
    setSearchParams({ category: selectedCategoryId || '', topic: topicId });
  };

  const handleBackToCategories = () => {
    setSelectedCategoryId(null);
    setSelectedTopicId(null);
    setSearchParams({});
  };

  const handleBackToTopics = () => {
    setSelectedTopicId(null);
    setSearchParams({ category: selectedCategoryId || '' });
  };

  // Se há resultado de busca, mostrar resultados
  if (searchTerm.trim() && searchResults.length > 0) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Central de Ajuda</h1>
          <p className="text-gray-600">Encontre respostas para suas dúvidas</p>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Pesquisar ajuda..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">
            {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} encontrado{searchResults.length !== 1 ? 's' : ''} para "{searchTerm}"
          </p>
        </div>

        <div className="space-y-4">
          {searchResults.map((topic) => {
            const category = helpCategories.find(cat => 
              cat.topics.some(t => t.id === topic.id)
            );
            return (
              <Card key={topic.id} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  if (category) {
                    handleCategorySelect(category.id);
                    handleTopicSelect(topic.id);
                  }
                }}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{topic.title}</CardTitle>
                      {category && (
                        <CardDescription className="mt-1">
                          <Badge variant="outline" className="mr-2">
                            <i className={`${category.icon} mr-1`}></i>
                            {category.name}
                          </Badge>
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 mb-3">{topic.description}</p>
                  {topic.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {topic.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {searchResults.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <HelpCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Nenhum resultado encontrado para "{searchTerm}"</p>
              <p className="text-sm text-gray-500 mt-2">Tente usar termos diferentes ou navegue pelas categorias</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Se um tópico está selecionado, mostrar detalhes
  if (selectedTopic) {
    const category = selectedCategory || helpCategories.find(cat => 
      cat.topics.some(t => t.id === selectedTopic.id)
    );

    return (
      <div className="container mx-auto py-8 max-w-4xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={handleBackToTopics}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para {category?.name || 'Categorias'}
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{selectedTopic.title}</h1>
          {category && (
            <Badge variant="outline" className="mb-4">
              <i className={`${category.icon} mr-1`}></i>
              {category.name}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardDescription className="text-base">{selectedTopic.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {selectedTopic.steps && selectedTopic.steps.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Passo a Passo
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-700">
                  {selectedTopic.steps.map((step, index) => (
                    <li key={index} className="pl-2">{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {selectedTopic.tips && selectedTopic.tips.length > 0 && (
              <div>
                <Separator className="my-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  Dicas
                </h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700">
                  {selectedTopic.tips.map((tip, index) => (
                    <li key={index} className="pl-2">{tip}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedTopic.relatedTopics && selectedTopic.relatedTopics.length > 0 && (
              <div>
                <Separator className="my-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Tópicos Relacionados</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedTopic.relatedTopics.map((relatedId) => {
                    const relatedTopic = getTopicById(relatedId);
                    if (!relatedTopic) return null;
                    return (
                      <Button
                        key={relatedId}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTopicSelect(relatedId)}
                      >
                        {relatedTopic.title}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se uma categoria está selecionada, mostrar tópicos
  if (selectedCategory) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={handleBackToCategories}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Categorias
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <i className={`${selectedCategory.icon} text-3xl text-primary`}></i>
            <h1 className="text-3xl font-bold text-gray-900">{selectedCategory.name}</h1>
          </div>
          <p className="text-gray-600">{selectedCategory.description}</p>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Pesquisar nesta categoria..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {selectedCategory.topics.map((topic) => (
            <Card
              key={topic.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleTopicSelect(topic.id)}
            >
              <CardHeader>
                <CardTitle className="text-lg">{topic.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{topic.description}</p>
                {topic.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {topic.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Tela inicial: mostrar categorias
  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-gray-900">Central de Ajuda</h1>
        </div>
        <p className="text-gray-600">Encontre respostas para suas dúvidas sobre o sistema</p>
      </div>

      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            type="text"
            placeholder="Pesquisar ajuda... (ex: criar agendamento, cadastrar cliente)"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 text-lg py-6"
          />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Navegar por Categorias</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {helpCategories.map((category) => (
          <Card
            key={category.id}
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary"
            onClick={() => handleCategorySelect(category.id)}
          >
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <i className={`${category.icon} text-2xl text-primary`}></i>
                <CardTitle className="text-xl">{category.name}</CardTitle>
              </div>
              <CardDescription>{category.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {category.topics.length} tópico{category.topics.length !== 1 ? 's' : ''}
                </span>
                <Button variant="ghost" size="sm">
                  Ver tópicos <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default HelpPage;

